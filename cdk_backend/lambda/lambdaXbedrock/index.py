# lambda/lambdaXbedrock/index.py
import os
import json
import boto3
import re
import logging
import urllib.parse
from botocore.exceptions import ClientError

from constants import load_from_env, REFERENCE_URLS

# --- Optional OpenSearch imports (via your layer) ---
try:
    from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
    _OPENSEARCH_AVAILABLE = True
except Exception:
    _OPENSEARCH_AVAILABLE = False

cfg = load_from_env()

# ---------- Logging ----------
logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.info(f"Using model/profile id: {cfg.INFERENCE_PROFILE_ID or cfg.LLM_MODEL_FALLBACK_ID}")
logger.info(
    f"Using KB ID: {cfg.KNOWLEDGE_BASE_ID or '(none)'} | "
    f"Bucket: {cfg.S3_BUCKET_NAME or '(none)'} | "
    f"OS endpoint: {cfg.OPENSEARCH_ENDPOINT or '(none)'}"
)

# ---------- AWS clients ----------
brt = boto3.client("bedrock-runtime", region_name=cfg.REGION)
agent_rt = boto3.client("bedrock-agent-runtime", region_name=cfg.REGION)
ws = boto3.client("apigatewaymanagementapi", endpoint_url=cfg.WEBSOCKET_CALLBACK_URL) if cfg.WEBSOCKET_CALLBACK_URL else None
s3 = boto3.client("s3") if cfg.S3_BUCKET_NAME else None

MODEL_ID = cfg.INFERENCE_PROFILE_ID or cfg.LLM_MODEL_FALLBACK_ID

# ---------- Runtime JSON KBs ----------
_RUNTIME_KB = None
_PERSONAL_KB = None
_RUNTIME_LAST_ETAG = None
_PERSONAL_LAST_ETAG = None
_CONFIG_LOADED = False

def _get_env(name, default=""):
    return getattr(cfg, name, None) or os.environ.get(name, default)

def _get_s3_object_text(key):
    """Read a small JSON file (runtime/personal) from S3."""
    if not s3 or not _get_env("S3_BUCKET_NAME") or not key:
        return "", None
    try:
        obj = s3.get_object(Bucket=_get_env("S3_BUCKET_NAME"), Key=key)
        body = obj["Body"].read().decode("utf-8")
        etag = (obj.get("ETag") or "").strip('"')
        return body, (etag or None)
    except Exception as e:
        logger.error(f"Failed to read S3 object {key}: {e}")
        return "", None

def _load_runtime_kbs(force=False):
    """Cold-start loader with ETag caching."""
    global _RUNTIME_KB, _PERSONAL_KB, _RUNTIME_LAST_ETAG, _PERSONAL_LAST_ETAG

    rk_key = _get_env("RUNTIME_KB_KEY")   # e.g., runtime/HIV_DDM_Chatbot_KB.json
    if rk_key:
        txt, etag = _get_s3_object_text(rk_key)
        if txt and (force or etag != _RUNTIME_LAST_ETAG or _RUNTIME_KB is None):
            _RUNTIME_KB = json.loads(txt)
            _RUNTIME_LAST_ETAG = etag
            logger.info(f"Loaded RUNTIME_KB key={rk_key} version={(_RUNTIME_KB.get('meta') or {}).get('version')}")

    pk_key = _get_env("PERSONAL_KB_KEY")  # e.g., runtime/personal_kb.json
    if pk_key:
        txt, etag = _get_s3_object_text(pk_key)
        if txt and (force or etag != _PERSONAL_LAST_ETAG or _PERSONAL_KB is None):
            _PERSONAL_KB = json.loads(txt)
            _PERSONAL_LAST_ETAG = etag
            logger.info(f"Loaded PERSONAL_KB key={pk_key} version={(_PERSONAL_KB.get('meta') or {}).get('version')}")

def _ensure_config_loaded():
    global _CONFIG_LOADED
    if not _CONFIG_LOADED:
        _load_runtime_kbs(force=True)
        _CONFIG_LOADED = True

# ---------- History normalization (adds prior chat context) ----------
def _normalize_history_items(history_raw) -> list[dict]:
    """Convert frontend message blocks into Bedrock 'messages' entries."""
    out = []
    for it in (history_raw or []):
        try:
            if (it.get("type") or "").upper() != "TEXT":
                continue
            role_src = (it.get("sentBy") or "").upper()
            text = (it.get("message") or "").strip()
            if not text:
                continue
            if role_src == "USER":
                out.append({"role": "user", "content": [{"text": text}]})
            elif role_src == "BOT":
                out.append({"role": "assistant", "content": [{"text": text}]})
        except Exception:
            continue
    return out

# ---------- Personal & Runtime matching ----------
def _norm(s: str) -> str:
    return (s or "").lower().strip()

def _match_personal(prompt: str):
    if not _PERSONAL_KB:
        return None
    q = _norm(prompt)
    for item in _PERSONAL_KB.get("qna", []):
        if _norm(item.get("question_exact")) == q:
            return item
        for p in item.get("patterns", []) or []:
            if p and _norm(p) in q:
                return item
    return None

def _match_runtime(prompt: str):
    if not _RUNTIME_KB:
        return None
    q = _norm(prompt)
    for item in _RUNTIME_KB.get("qna", []):
        if _norm(item.get("question_exact")) == q:
            return item
        for p in item.get("patterns", []) or []:
            if p and _norm(p) in q:
                return item
    return None

def _get_source_meta(source_code: str) -> dict | None:
    try:
        return (_RUNTIME_KB or {}).get("sources", {}).get(source_code)
    except Exception:
        return None

# ---------- URL & Markdown helpers ----------
def _md_link(url: str, label: str | None = None) -> str:
    try:
        host = urllib.parse.urlparse(url).netloc or url
    except Exception:
        host = url
    return f"[{label or host}]({url})"

def _title_for_url(url: str) -> str:
    try:
        p = urllib.parse.urlparse(url)
        host = (p.netloc or "").lower()
        path_last = (p.path.rstrip("/").split("/")[-1] if p.path else "").replace("-", " ").strip()
    except Exception:
        host, path_last = "", ""
    domain_map = {
        "aidsinfo.unaids.org": "UNAIDS AIDSinfo",
        "www.who.int": "World Health Organization (WHO)",
        "who.int": "World Health Organization (WHO)",
        "prepwatch.org": "PrEPWatch",
        "phia.icap.columbia.edu": "ICAP PHIA",
        "icap.columbia.edu": "ICAP at Columbia University"
    }
    if host in domain_map:
        return domain_map[host]
    if path_last and "." not in path_last:
        return path_last.title()
    if host:
        parts = host.split(".")
        if len(parts) > 2:
            host = ".".join(parts[-2:])
        return host
    return url

def _basename_from_url(u: str) -> str:
    try:
        p = urllib.parse.urlparse(u)
        name = (p.path or "").split("/")[-1]
        name = urllib.parse.unquote(name or "")
        name = name.split("?")[0].split("#")[0]
        return name
    except Exception:
        return u or ""

# ---------- Short display helpers ----------
def _short_source_name(full_name: str) -> str:
    name = (full_name or "").strip()
    if not name:
        return "Source"
    if "(" in name and ")" in name:
        try:
            inside = name[name.index("(") + 1:name.index(")")].strip()
            tail = name[name.index(")") + 1:].strip()
            if inside and tail:
                return f"{inside} {tail}".strip()
            if inside:
                return inside
        except Exception:
            pass
    if "AIDSinfo" in name:
        return "AIDSinfo"
    if "PrEP-IT" in name or "PREP-IT" in name:
        return "PrEP-IT"
    if "STATcompiler" in name:
        return "STATcompiler"
    if ":" in name:
        return name.split(":", 1)[1].strip() or name
    parts = name.split()
    if len(parts) > 1 and parts[0].upper() in {"UNAIDS", "WHO", "ICAP"}:
        return " ".join(parts[1:]).strip()
    return name

def _question_to_statement(q: str) -> str:
    if not q:
        return ""
    s = q.strip().rstrip(" ?!.")
    for pat in [
        r"^\s*what\s+is\s+(the\s+)?", r"^\s*what'?s\s+(the\s+)?", r"^\s*what\s+are\s+(the\s+)?",
        r"^\s*where\s+can\s+i\s+find\s+", r"^\s*how\s+can\s+i\s+", r"^\s*how\s+do\s+i\s+", r"^\s*which\s+",
    ]:
        if re.match(pat, s, flags=re.IGNORECASE):
            s = re.sub(pat, "", s, flags=re.IGNORECASE).strip()
            break
    if s:
        s = s[0].upper() + s[1:]
    return s or q.strip().rstrip("?")

def _ack_line_for_item(item: dict) -> str:
    explicit_answer = (item.get("answer_text") or item.get("answer") or "").strip()
    if explicit_answer:
        return f"{explicit_answer} — here’s the best source:"
    q = (item.get("question_exact") or "").strip()
    stmt = _question_to_statement(q) if q else "Here’s the best source"
    return f"{stmt} — here’s the best source:"

def _reply_link_only(connection_id: str, item: dict):
    """Link-only route with concise preface and a SINGLE clickable link."""
    url = (item.get("source_url") or "").strip()
    meta = _get_source_meta(item.get("primary_source", ""))
    if not url and meta:
        url = (meta.get("url") or "").strip()

    full_name = (meta or {}).get("name") or (item.get("primary_source") or "Link")
    short_name = (full_name or "Source").strip()

    ack = _ack_line_for_item(item)
    link_line = f"👉 {_md_link(url, _title_for_url(url) or f'the {short_name} Website')}" if url else f"👉 the {short_name} Website"

    text = f"{ack}\n\n{short_name}\n\n{link_line}"
    _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": text})
    _send_ws(connection_id, {"type": "end", "statusCode": 200})

# ---------- Runtime teaching context ----------
def _runtime_relevant_resources(prompt: str, top_n: int = 4) -> list[dict]:
    resources = (_RUNTIME_KB or {}).get("resources", [])
    if not resources:
        return []
    q_tokens = set(re.findall(r"[a-z0-9\-]+", _norm(prompt)))
    scored = []
    for r in resources:
        text = " ".join([
            r.get("name", ""), r.get("summary", ""),
            " ".join(r.get("when_to_use", []) or []),
            " ".join(r.get("match_terms", []) or []),
            r.get("category", "")
        ]).lower()
        r_tokens = set(re.findall(r"[a-z0-9\-]+", text))
        overlap = len(q_tokens.intersection(r_tokens))
        if "agyw" in q_tokens and "agyw" in r_tokens:
            overlap += 2
        if "district" in q_tokens or "subnational" in q_tokens:
            if "sub" in r_tokens or "district" in r_tokens:
                overlap += 1
        if "prep" in q_tokens and "prep" in r_tokens:
            overlap += 2
        if "testing" in q_tokens and "statcompiler" in r.get("name","").lower():
            overlap += 1
        if overlap > 0:
            scored.append((overlap, r))
    scored.sort(key=lambda x: x[0], reverse=True)
    return [r for _, r in scored[:max(1, top_n)]]

def _build_runtime_context(prompt: str) -> str:
    try:
        rules = "\n".join((_RUNTIME_KB or {}).get("style", {}).get("answer_rules", [])[:3])
        picks = _runtime_relevant_resources(prompt, top_n=4)
        lines = []
        for r in picks:
            name = r.get("name", "Resource")
            url = r.get("url", "")
            summary = r.get("summary", "")
            use = "; ".join(r.get("when_to_use", [])[:2]) if r.get("when_to_use") else ""
            caveat = "; ".join(r.get("caveats", [])[:1]) if r.get("caveats") else ""
            bits = [summary]
            if use:
                bits.append(f"When to use: {use}")
            if caveat:
                bits.append(f"Caveat: {caveat}")
            joined = " ".join([b for b in bits if b]).strip()
            if url:
                lines.append(f"- {name} — {joined} (URL: {url})")
            else:
                lines.append(f"- {name} — {joined}")
        rules_block = f"<answer_rules>\n{rules}\n</answer_rules>\n" if rules else ""
        picks_block = "\n".join(lines) if lines else ""
        if not (rules_block or picks_block):
            return ""
        return f"{rules_block}<runtime_resource_map>\n{picks_block}\n</runtime_resource_map>"
    except Exception:
        return ""

# ---------- HIV gating ----------
_HIV_TOKENS = {
    "hiv", "aids", "prep", "pre-exposure", "prophylaxis", "incidence", "prevalence",
    "who", "unaids", "scorecards", "gpc", "statcompiler", "dhis2", "phia",
    "agyw", "key", "populations", "psat", "shipp"
}

def _should_use_kb(prompt: str) -> bool:
    toks = set(re.findall(r"[a-z0-9\-]+", _norm(prompt)))
    return any(t in toks for t in _HIV_TOKENS)

# ---------- Suggested reference picking ----------
def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))

def _url_tokens(u: str) -> set[str]:
    try:
        p = urllib.parse.urlparse(u)
        host_parts = p.netloc.lower().split(".")
        path_parts = re.split(r"[^a-z0-9]+", p.path.lower())
        return {t for t in host_parts + path_parts if t}
    except Exception:
        return set()

def _pick_reference_url(prompt: str) -> str | None:
    """
    Choose one URL from REFERENCE_URLS via token overlap + domain boosts.
    Country hints supported for: Eswatini, Ghana, Kenya, Lesotho, Malawi, Mozambique,
    Nigeria, South Africa, South Sudan, Tanzania, Uganda, Zambia, Zimbabwe.
    """
    if not REFERENCE_URLS:
        return None
    q = _tokenize(prompt)
    if "prep" in q: q.update({"pre", "preexposure", "prophylaxis"})
    if "hiv" in q: q.update({"aids"})
    if "who" in q: q.update({"world", "health", "organization"})
    if "eswatini" in q or "swaziland" in q: q.update({"sz", "eswatini", "swaziland"})
    if "ghana" in q: q.update({"gh"})
    if "kenya" in q: q.update({"ke"})
    if "lesotho" in q: q.update({"ls"})
    if "malawi" in q: q.update({"mw"})
    if "mozambique" in q: q.update({"mz"})
    if "nigeria" in q: q.update({"ng"})
    if "tanzania" in q: q.update({"tz"})
    if "uganda" in q: q.update({"ug"})
    if "zambia" in q: q.update({"zm"})
    if "zimbabwe" in q: q.update({"zw"})
    if {"south", "africa"}.issubset(q): q.update({"za", "rsa", "southafrica"})
    if {"south", "sudan"}.issubset(q): q.update({"ss", "southsudan"})
    best_url, best_score = None, -1
    for u in REFERENCE_URLS:
        toks = _url_tokens(u)
        score = sum(1 for t in toks if t in q)
        if "unaids" in toks: score += 1
        if "who" in toks: score += 1
        if "prepwatch" in toks: score += 1
        if "icap" in toks or "phia" in toks: score += 1
        if score > best_score:
            best_score, best_url = score, u
    return best_url or REFERENCE_URLS[0]

# ---------- OpenSearch (optional COUNT support) ----------
_os = None
if _OPENSEARCH_AVAILABLE and cfg.OPENSEARCH_ENDPOINT:
    try:
        sess = boto3.Session()
        creds = sess.get_credentials()
        service = "aoss" if ".aoss." in cfg.OPENSEARCH_ENDPOINT else "es"
        auth = AWSV4SignerAuth(creds, cfg.REGION, service)
        host = cfg.OPENSEARCH_ENDPOINT.replace("https://", "")
        _os = OpenSearch(
            hosts=[{"host": host, "port": 443}],
            http_auth=auth,
            use_ssl=True,
            verify_certs=True,
            connection_class=RequestsHttpConnection,
            timeout=30,
            pool_maxsize=20,
        )
        _ = _os.ping()
        logger.info("OpenSearch client initialized.")
    except Exception as e:
        logger.error(f"OpenSearch init failed: {e}")
        _os = None
elif not _OPENSEARCH_AVAILABLE and cfg.OPENSEARCH_ENDPOINT:
    logger.warning("OpenSearch layer not available; COUNT disabled.")

_COUNT_STARTERS = (
    "how many papers", "count papers", "number of papers", "how many documents",
    "count documents", "list papers containing", "list documents containing",
    "count documents mentioning", "count documents about"
)

def _looks_like_count(q: str) -> bool:
    ql = _norm(q)
    if any(ql.startswith(s) for s in _COUNT_STARTERS):
        return True
    return ("how many" in ql and ("mention" in ql or "contain" in ql)) or ql.startswith("list ")

def _extract_keyword(q: str) -> str | None:
    m = re.search(r'"([^"]+)"', q) or re.search(r"'([^']+)'", q)
    if m:
        kw = m.group(1).strip()
        return kw if kw else None
    ql = q.lower()
    for trigger in ["mention ", "containing ", "contain ", "about "]:
        if trigger in ql:
            start = ql.index(trigger) + len(trigger)
            tail = ql[start:].strip()
            token = tail.split("?")[0].split(",")[0].strip()
            token = " ".join(token.split()[:5]).strip('.,!?\";\'')
            if token:
                return token
    return None

# ---------- Source utilities (de-dup with best score) ----------
def _clean_filename(s3_uri_or_url: str) -> str:
    src = s3_uri_or_url or ""
    if not src:
        return "Unknown source"
    try:
        if src.startswith("s3://"):
            part = src.split("/", 3)[-1]
        elif src.startswith("https://") or src.startswith("http://"):
            from urllib.parse import urlparse, unquote
            parsed = urlparse(src)
            part = parsed.path.lstrip("/")
            return (unquote(part.split("/")[-1]) or "Unknown source")
        else:
            part = src
        from urllib.parse import unquote
        return (unquote(part.split("/")[-1]) or "Unknown source")
    except Exception:
        return src.split("/")[-1] if "/" in src else src

def _doc_url_from_s3_uri(s3_uri: str) -> str:
    if not s3_uri or not s3_uri.startswith("s3://"):
        return s3_uri or ""
    try:
        parts = s3_uri[5:].split("/", 1)
        if len(parts) != 2:
            return s3_uri
        bucket, key = parts[0], parts[1]
        if s3 and cfg.S3_BUCKET_NAME and bucket == cfg.S3_BUCKET_NAME:
            try:
                return s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": bucket, "Key": key, "ResponseContentDisposition": "inline"},
                    ExpiresIn=3600,
                )
            except Exception as e:
                logger.warning(f"Presign failed for {s3_uri}: {e}")
        return f"https://{bucket}.s3.amazonaws.com/{key}"
    except Exception:
        return s3_uri

def _score_value(v):
    """Convert score to sortable number; None/'N/A' -> -inf."""
    if isinstance(v, (int, float)):
        return float(v)
    try:
        if v is None:
            return float("-inf")
        return float(v)
    except Exception:
        return float("-inf")

def _dedupe_sources_best(items: list[dict]) -> list[dict]:
    """
    De-duplicate by normalized filename/label; keep the variant with the BEST (highest) score.
    If scores tie, prefer one with a 'page'; then with an HTTPS URL.
    """
    best_by_key: dict[str, dict] = {}
    order: list[str] = []
    for it in items or []:
        url = (it.get("url") or "").strip()
        label = (it.get("label") or _clean_filename(url) or url).strip()
        key = label.lower()
        cur_best = best_by_key.get(key)
        if not cur_best:
            best_by_key[key] = it
            order.append(key)
            continue
        # Compare scores
        s_new = _score_value(it.get("score"))
        s_old = _score_value(cur_best.get("score"))
        take_new = False
        if s_new > s_old:
            take_new = True
        elif s_new == s_old:
            # tie-breakers
            has_page_new = "page" in it and it["page"] is not None
            has_page_old = "page" in cur_best and cur_best["page"] is not None
            if has_page_new and not has_page_old:
                take_new = True
            elif has_page_new == has_page_old:
                https_new = (it.get("url") or "").startswith("https://")
                https_old = (cur_best.get("url") or "").startswith("https://")
                if https_new and not https_old:
                    take_new = True
        if take_new:
            best_by_key[key] = it
    return [best_by_key[k] for k in order]

# ---------- OpenSearch COUNT (details list already unique by doc id) ----------
def _os_count_keyword(keyword: str) -> tuple[str, str, list[dict]]:
    if not _os or not cfg.OPENSEARCH_INDEX:
        raise RuntimeError("OpenSearch not configured.")
    text_field = cfg.OPENSEARCH_TEXT_FIELD or "AMAZON_BEDROCK_TEXT_CHUNK"
    doc_id_field = cfg.OPENSEARCH_DOC_ID_FIELD or "x-amz-bedrock-kb-source-uri.keyword"
    page_field = cfg.OPENSEARCH_PAGE_FIELD or "x-amz-bedrock-kb-document-page-number"
    body = {
        "size": 0,
        "query": {"match": {text_field: {"query": keyword, "operator": "and"}}},
        "aggs": {
            "unique_docs_matching": {"cardinality": {"field": doc_id_field}},
            "docs": {
                "terms": {"field": doc_id_field, "size": 200},
                "aggs": {"pages": {"terms": {"field": page_field, "size": 200, "order": {"_key": "asc"}}}}
            },
            "all_docs": {"global": {}, "aggs": {"total_unique_docs": {"cardinality": {"field": doc_id_field}}}}
        }
    }
    resp = _os.search(index=cfg.OPENSEARCH_INDEX, body=body, request_timeout=60)
    aggs = resp.get("aggregations") or {}
    unique_match = (aggs.get("unique_docs_matching") or {}).get("value") or 0
    total_unique = ((aggs.get("all_docs") or {}).get("total_unique_docs") or {}).get("value")
    summary = (
        f'The keyword "{keyword}" appears in {unique_match} of {total_unique} papers.'
        if total_unique not in (None, 0) else
        f'The keyword "{keyword}" appears in {unique_match} papers.'
    )
    lines = []
    sources_list: list[dict] = []
    buckets = ((aggs.get("docs") or {}).get("buckets") or [])
    for i, b in enumerate(buckets, 1):
        s3_uri = b.get("key", "")
        doc_url = _doc_url_from_s3_uri(s3_uri)
        display = _clean_filename(s3_uri)
        pages_b = (b.get("pages") or {}).get("buckets") or []
        pages = []
        for pb in pages_b:
            k = pb.get("key")
            try:
                if isinstance(k, (int, float)):
                    pages.append(int(k))
                elif isinstance(k, str) and k.isdigit():
                    pages.append(int(k))
            except Exception:
                pass
        pages = sorted(set(pages))
        title_md = _md_link(doc_url, display) if doc_url else display
        if pages:
            page_links = ", ".join(_md_link(f"{doc_url}#page={p}", str(p)) for p in pages if doc_url)
            lines.append(f"{i}. {title_md} (pages: {page_links or ', '.join(map(str, pages))})")
        else:
            lines.append(f"{i}. {title_md} (pages: unknown)")
        src_obj: dict = {"url": doc_url or s3_uri, "label": display}
        if pages:
            src_obj["page"] = pages[0]
        sources_list.append(src_obj)
    details = "\n".join(lines) if lines else "No documents listed."
    return summary, details, _dedupe_sources_best(sources_list)

# ---------- WebSocket helpers ----------
def _send_ws(connection_id: str, payload: dict):
    if not ws:
        logger.error("WebSocket client not configured (URL env missing).")
        return
    try:
        ws.post_to_connection(ConnectionId=connection_id, Data=json.dumps(payload))
    except ClientError as e:
        logger.error(f"WebSocket post_to_connection error: {e}")

def _end_with_error(connection_id: str, message: str, code: int = 500):
    _send_ws(connection_id, {"type": "error", "statusCode": code, "text": message})
    _send_ws(connection_id, {"type": "end", "statusCode": code})

# ---------- Bedrock KB retrieval ----------
def _kb_retrieve(prompt: str, kb_id: str, k: int = 10) -> tuple[str, list[dict]]:
    """Fetch top-k chunks + build presigned sources with labels; de-dup best."""
    if not kb_id:
        return "", []
    try:
        resp = agent_rt.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery={"text": prompt},
            retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": k}},
        )
        results = resp.get("retrievalResults") or []
        if not results:
            return "", []
        snippets: list[str] = []
        sources_raw: list[dict] = []
        for r in results:
            txt = (r.get("content") or {}).get("text", "")
            if txt:
                snippets.append(txt)
            loc = (r.get("location") or {}).get("s3Location") or {}
            s3_uri = loc.get("uri")
            score = r.get("score")
            page = (r.get("metadata") or {}).get("x-amz-bedrock-kb-document-page-number")
            url = s3_uri
            if s3_uri and cfg.S3_BUCKET_NAME and s3 and s3_uri.startswith(f"s3://{cfg.S3_BUCKET_NAME}/"):
                try:
                    key = s3_uri.split(f"s3://{cfg.S3_BUCKET_NAME}/", 1)[1]
                    url = s3.generate_presigned_url(
                        "get_object",
                        Params={"Bucket": cfg.S3_BUCKET_NAME, "Key": key, "ResponseContentDisposition": "inline"},
                        ExpiresIn=3600,
                    )
                except Exception as e:
                    logger.warning(f"Presign failed for {s3_uri}: {e}")
            src: dict = {"url": url}
            if page is not None:
                src["page"] = page
            if isinstance(score, (int, float)):
                src["score"] = float(score)
            if url:
                src["label"] = _clean_filename(url)
            sources_raw.append(src)
        # De-duplicate by best score, then keep top 5 by original order of best picks
        deduped = _dedupe_sources_best(sources_raw)
        return ("\n\n".join(snippets).strip(), deduped[:3])
    except ClientError as e:
        logger.error(f"KB retrieve ClientError: {e}")
        return "", []
    except Exception as e:
        logger.error(f"KB retrieve unexpected error: {e}")
        return "", []

# ---------- URL detection ----------
_URL_RE = re.compile(r"https?://[^\s)>\]]+", re.IGNORECASE)

def _extract_first_url_from_history(history_raw) -> str | None:
    """Walk backwards through prior BOT messages and return the first URL mentioned."""
    for it in reversed(history_raw or []):
        try:
            if (it.get("type") or "").upper() != "TEXT":
                continue
            if (it.get("sentBy") or "").upper() != "BOT":
                continue
            msg = (it.get("message") or "")
            m = _URL_RE.search(msg)
            if m:
                return m.group(0)
        except Exception:
            continue
    return None

# ---------- Summarization (PDF) ----------
def _kb_retrieve_for_doc(prompt: str, doc_url_hint: str, k: int = 20) -> tuple[str, list[dict]]:
    all_text, all_sources = _kb_retrieve(prompt, cfg.KNOWLEDGE_BASE_ID, k)
    if not (all_text or all_sources):
        return "", []
    hint = _basename_from_url(doc_url_hint)
    bias_prompt = f"{hint} {prompt}".strip()
    text2, sources2 = _kb_retrieve(bias_prompt, cfg.KNOWLEDGE_BASE_ID, k)
    preferred_sources = [s for s in (sources2 or []) if _basename_from_url(s.get('url') or "").lower() == hint.lower()]
    if preferred_sources:
        return text2, preferred_sources
    filtered_sources = [s for s in (all_sources or []) if _basename_from_url(s.get('url') or "").lower() == hint.lower()]
    return (all_text if filtered_sources else all_text), (filtered_sources or all_sources)

def _stream_summary_from_chunks(connection_id: str, prompt: str, doc_url: str, history_messages: list[dict] | None = None):
    kb_text, kb_sources = _kb_retrieve_for_doc(prompt, doc_url, k=20)
    if not kb_text:
        _end_with_error(connection_id, "I couldn’t retrieve that document’s text from the knowledge base.", 404)
        return

    user_text = (
        "You will summarize an official PDF. Use ONLY the provided snippets; do not invent facts. "
        "Write a concise, structured brief with:\n"
        "• Purpose & scope\n"
        "• Key recommendations / policies\n"
        "• Priority populations & service delivery\n"
        "• Testing, treatment & prevention highlights\n"
        "• Any dates/versions that matter\n"
        "Keep it clear and bulleted. If something is unclear, say so.\n\n"
        f"<doc_url>{doc_url}</doc_url>\n"
        "<knowledge_snippets>\n"
        f"{kb_text}\n"
        "</knowledge_snippets>\n\n"
        f"User request: {prompt}"
    )

    messages: list[dict] = []
    if history_messages:
        messages.extend(history_messages)
    messages.append({"role": "user", "content": [{"text": user_text}]})
    system = [{"text": (cfg.SYSTEM_PROMPT or "") + "\nBe accurate and concise."}] if cfg.SYSTEM_PROMPT else [{"text": "Be accurate and concise."}]

    try:
        resp = brt.converse_stream(modelId=MODEL_ID, messages=messages, system=system)
    except ClientError as e:
        logger.error(f"Bedrock ClientError (summary): {e}")
        _end_with_error(connection_id, f"Model error: {e.response.get('Error',{}).get('Code','Unknown')}", 500)
        return

    stream = resp.get("stream")
    if not stream:
        _end_with_error(connection_id, "Model stream not available.", 500)
        return

    for ev in stream:
        if "contentBlockDelta" in ev:
            delta = (ev["contentBlockDelta"].get("delta") or {}).get("text")
            if delta:
                _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": delta})
        elif "messageStop" in ev:
            break
        elif "internalServerException" in ev or "modelStreamErrorException" in ev \
                or "throttlingException" in ev or "validationException" in ev:
            err = ev.get("internalServerException") or ev.get("modelStreamErrorException") \
                  or ev.get("throttlingException") or ev.get("validationException")
            logger.error(f"Stream error (summary): {err}")
            _end_with_error(connection_id, "Model streaming error.", 500)
            return

    if kb_sources := _dedupe_sources_best(kb_sources or []):
        _send_ws(connection_id, {"type": "sources", "statusCode": 200, "sources": kb_sources})

    _send_ws(connection_id, {"type": "end", "statusCode": 200})

# ---------- Model talk (with history context) ----------
def _talk_with_optional_kb(connection_id: str, prompt: str, history_messages: list[dict] | None = None):
    use_kb = _should_use_kb(prompt)

    # Suggested reference — SINGLE clickable link (no duplicate bare URL)
    ref_url = None
    if use_kb:
        try:
            ref_url = _pick_reference_url(prompt)
            if ref_url:
                ref_title = _title_for_url(ref_url)
                _send_ws(connection_id, {
                    "type": "delta",
                    "statusCode": 200,
                    "format": "markdown",
                    "text": f"**Suggested reference:** {_md_link(ref_url, ref_title)}\n\n"
                })
        except Exception:
            ref_url = None  # non-fatal

    runtime_ctx = _build_runtime_context(prompt) if use_kb else ""
    kb_text, kb_sources = ("", [])
    if use_kb:
        kb_text, kb_sources = _kb_retrieve(prompt, cfg.KNOWLEDGE_BASE_ID)

    # Compose message to the model
    if runtime_ctx or kb_text:
        user_text = (
            "Use the following runtime routing map and brief bios to choose the right data source/tool. "
            "Then consult the knowledge snippets if helpful to answer. "
            "Be concise and avoid extraneous text.\n"
            f"{runtime_ctx}\n"
            f"<knowledge_source>\n{kb_text}\n</knowledge_source>\n\n"
            f"User question: {prompt}"
        )
    else:
        user_text = "Answer helpfully and accurately. If information is missing, say what would help.\n\n" f"User question: {prompt}"

    messages: list[dict] = []
    if history_messages:
        messages.extend(history_messages)
    messages.append({"role": "user", "content": [{"text": user_text}]})
    system = [{"text": cfg.SYSTEM_PROMPT}] if cfg.SYSTEM_PROMPT else None

    streamed_text_parts: list[str] = []
    try:
        resp = brt.converse_stream(modelId=MODEL_ID, messages=messages, system=system)
    except ClientError as e:
        logger.error(f"Bedrock ClientError: {e}")
        _end_with_error(connection_id, f"Model error: {e.response.get('Error',{}).get('Code','Unknown')}", 500)
        return

    stream = resp.get("stream")
    if not stream:
        _end_with_error(connection_id, "Model stream not available.", 500)
        return

    for ev in stream:
        if "contentBlockDelta" in ev:
            delta = (ev["contentBlockDelta"].get("delta") or {}).get("text")
            if delta:
                streamed_text_parts.append(delta)
                _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": delta})
        elif "messageStop" in ev:
            break
        elif "internalServerException" in ev or "modelStreamErrorException" in ev \
                or "throttlingException" in ev or "validationException" in ev:
            err = ev.get("internalServerException") or ev.get("modelStreamErrorException") \
                  or ev.get("throttlingException") or ev.get("validationException")
            logger.error(f"Stream error: {err}")
            _end_with_error(connection_id, "Model streaming error.", 500)
            return

    # After the summary text, append ONE hyperlinked "other resource" if the model emitted a bare URL.
    try:
        full_summary = "".join(streamed_text_parts)
        m = _URL_RE.search(full_summary or "")
        if m:
            other_url = m.group(0).strip()
            # Skip if it's the same as suggested ref or already hyperlinked somewhere
            already_linked = re.search(r"\]\(\s*" + re.escape(other_url) + r"\s*\)", full_summary or "", flags=re.IGNORECASE)
            if other_url and other_url != (ref_url or "") and not already_linked:
                _send_ws(connection_id, {
                    "type": "delta",
                    "statusCode": 200,
                    "format": "markdown",
                    "text": "\n\n" + _md_link(other_url, _title_for_url(other_url)) + "\n"
                })
    except Exception as e:
        logger.warning(f"Post-append hyperlink step error: {e}")

    # Sources block — de-dupe with best score
    sources_to_send = []
    if use_kb and kb_sources:
        sources_to_send.extend(kb_sources)
    if use_kb and ref_url:
        sources_to_send.append({"url": ref_url, "label": _title_for_url(ref_url), "score": None})
    sources_to_send = _dedupe_sources_best(sources_to_send)
    if sources_to_send:
        _send_ws(connection_id, {"type": "sources", "statusCode": 200, "sources": sources_to_send})

    _send_ws(connection_id, {"type": "end", "statusCode": 200})

# ---------- Handler ----------
def lambda_handler(event, _context):
    try:
        connection_id = event.get("connectionId")
        prompt = (event.get("prompt") or "").strip()

        if not connection_id:
            return {"statusCode": 400, "body": "Missing connectionId"}
        if not prompt:
            _end_with_error(connection_id, "Please provide a prompt.", 400)
            return {"statusCode": 400, "body": "Empty prompt"}

        try:
            logger.info(f"START event meta: has_connection_id={bool(connection_id)}, prompt_len={len(prompt)}")
        except Exception:
            pass

        _ensure_config_loaded()

        # 1) Personal intercepts
        phit = _match_personal(prompt)
        if phit:
            answer = phit.get("answer_template") or "Got it."
            _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": answer})
            _send_ws(connection_id, {"type": "end", "statusCode": 200})
            return {"statusCode": 200, "body": "PERSONAL_KB_OK"}

        # 2) Runtime routing: link-only items
        rhit = _match_runtime(prompt)
        if rhit and rhit.get("link_only"):
            _reply_link_only(connection_id, rhit)
            return {"statusCode": 200, "body": "RUNTIME_LINK_ONLY_OK"}

        # 2.5) Summarization flow
        if any(t in (prompt or "").lower() for t in (
            "summarize", "summary of", "sum up", "tl;dr", "key findings", "key points",
            "what are the findings", "what are the main points"
        )):
            history_raw = event.get("history") or []
            history_msgs = _normalize_history_items(history_raw)
            first_url = _extract_first_url_from_history(history_raw)
            if not first_url:
                _end_with_error(connection_id, "I couldn’t find a prior link to summarize. Please paste the link or ask again after I share one.", 400)
                return {"statusCode": 400, "body": "No prior link in history"}
            _stream_summary_from_chunks(connection_id, prompt, first_url, history_messages=history_msgs)
            return {"statusCode": 200, "body": "SUMMARY_OK"}

        # 3) COUNT flow
        if _looks_like_count(prompt):
            if not (_os and cfg.OPENSEARCH_INDEX and cfg.OPENSEARCH_TEXT_FIELD and cfg.OPENSEARCH_DOC_ID_FIELD and cfg.OPENSEARCH_PAGE_FIELD):
                _end_with_error(connection_id, "Document counting is not configured.", 501)
                return {"statusCode": 501, "body": "COUNT not configured"}
            keyword = _extract_keyword(prompt)
            if not keyword:
                _end_with_error(connection_id, "I couldn't find the keyword to count. Try: how many papers mention \"cats\"?", 400)
                return {"statusCode": 400, "body": "No keyword extracted"}
            try:
                summary, details_md, count_sources = _os_count_keyword(keyword)
                _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": summary + "\n\n" + details_md})
                if count_sources:
                    _send_ws(connection_id, {"type": "sources", "statusCode": 200, "sources": count_sources})
                _send_ws(connection_id, {"type": "end", "statusCode": 200})
                return {"statusCode": 200, "body": "COUNT OK"}
            except Exception as e:
                logger.error(f"COUNT error: {e}", exc_info=True)
                _end_with_error(connection_id, "There was a problem counting documents.", 500)
                return {"statusCode": 500, "body": "COUNT error"}

        # 4) Normal talk
        history_raw = event.get("history") or []
        history_msgs = _normalize_history_items(history_raw)
        try:
            logger.info(f"History received: items={len(history_raw)}, used_text_turns={len(history_msgs)}")
        except Exception:
            pass

        _talk_with_optional_kb(connection_id, prompt, history_messages=history_msgs)
        return {"statusCode": 200, "body": "OK"}

    except Exception as e:
        logger.error(f"Fatal handler error: {e}", exc_info=True)
        cid = event.get("connectionId")
        if cid:
            _end_with_error(cid, "Internal error.", 500)
        return {"statusCode": 500, "body": "Internal error"}