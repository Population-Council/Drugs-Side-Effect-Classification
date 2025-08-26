# lambda/lambdaXbedrock/index.py
import os
import json
import boto3
import re
import logging
import urllib.parse
from botocore.exceptions import ClientError

# Optional OpenSearch imports (via your layer)
try:
    from opensearchpy import OpenSearch, RequestsHttpConnection, AWSV4SignerAuth
    _OPENSEARCH_AVAILABLE = True
except Exception:
    _OPENSEARCH_AVAILABLE = False

from constants import load_from_env, REFERENCE_URLS

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

# ---------- Runtime JSON KBs (loaded on cold start, refreshed by ETag) ----------
_RUNTIME_KB = None
_PERSONAL_KB = None
_RUNTIME_LAST_ETAG = None
_PERSONAL_LAST_ETAG = None
_CONFIG_LOADED = False

def _get_env(name, default=""):
    return getattr(cfg, name, None) or os.environ.get(name, default)

def _get_s3_object_text(key):
    """Read a small text file from S3. Degrade gracefully if not present/authorized."""
    if not s3 or not _get_env("S3_BUCKET_NAME") or not key:
        return "", None
    try:
        obj = s3.get_object(Bucket=_get_env("S3_BUCKET_NAME"), Key=key)
        body = obj["Body"].read().decode("utf-8")
        etag = (obj.get("ETag") or "").strip('"')
        return body, (etag or None)
    except Exception as e:
        logger.warning(f"Optional runtime file not loaded {key}: {e}")
        return "", None

def _load_runtime_kbs(force=False):
    """Best-effort load of runtime JSONs."""
    global _RUNTIME_KB, _PERSONAL_KB, _RUNTIME_LAST_ETAG, _PERSONAL_LAST_ETAG

    rk_key = _get_env("RUNTIME_KB_KEY")
    if rk_key:
        txt, etag = _get_s3_object_text(rk_key)
        if txt and (force or etag != _RUNTIME_LAST_ETAG or _RUNTIME_KB is None):
            _RUNTIME_KB = json.loads(txt)
            _RUNTIME_LAST_ETAG = etag
            logger.info(f"Loaded RUNTIME_KB key={rk_key} version={( _RUNTIME_KB.get('meta') or {}).get('version')}")

    pk_key = _get_env("PERSONAL_KB_KEY")
    if pk_key:
        txt, etag = _get_s3_object_text(pk_key)
        if txt and (force or etag != _PERSONAL_LAST_ETAG or _PERSONAL_KB is None):
            _PERSONAL_KB = json.loads(txt)
            _PERSONAL_LAST_ETAG = etag
            logger.info(f"Loaded PERSONAL_KB key={pk_key} version={( _PERSONAL_KB.get('meta') or {}).get('version')}")

def _ensure_config_loaded():
    global _CONFIG_LOADED
    if not _CONFIG_LOADED:
        _load_runtime_kbs(force=True)
        _CONFIG_LOADED = True

# ---------- Normalization + runtime matching ----------
def _normalize_text(s: str) -> str:
    s = s or ""
    s = s.lower()
    s = re.sub(r"[’']", " ", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()

def _norm_contains(big: str, small: str) -> bool:
    return _normalize_text(small) in _normalize_text(big)

def _ctx_from_entities() -> dict:
    """Build a dict so {{user.cat_name}} can be rendered."""
    ctx = {}
    ents = (_RUNTIME_KB or {}).get("entities", {})
    for k, v in ents.items():
        parts = k.split(".")
        d = ctx
        for seg in parts[:-1]:
            d = d.setdefault(seg, {})
        d[parts[-1]] = v
    return ctx

def _render_template(tpl: str, ctx: dict) -> str:
    """Very small {{ dotted.keys }} renderer."""
    if not tpl:
        return ""
    def repl(m):
        key = (m.group(1) or "").strip()
        cur = ctx
        for seg in key.split("."):
            if isinstance(cur, dict) and seg in cur:
                cur = cur[seg]
            else:
                return m.group(0)
        return str(cur)
    return re.sub(r"\{\{\s*([^}]+)\s*\}\}", repl, tpl)

def _runtime_item_is_link_only(item: dict) -> bool:
    """Decide if a runtime QnA item should answer with title+link only."""
    if not item:
        return False
    if item.get("link_only") is True:
        return True
    if (item.get("mode") or "").lower() == "link_only":
        return True
    # If template has placeholders, also treat as link-only to avoid printing scaffolding
    tpl = item.get("answer_template") or ""
    if "[VALUE]" in tpl or "[YEAR]" in tpl:
        return True
    return False

def _answer_from_runtime_qna(item: dict) -> tuple[str, list]:
    """
    Build final text + (optional) sources from a runtime QnA item.
    If link_only => just 'Title: <URL>' in chat; still emits the source bubble once.
    """
    ctx = _ctx_from_entities()
    sources = []
    url = item.get("source_url")
    title = item.get("title") or item.get("name") or (url and _title_for_url(url)) or "Source"

    # LINK-ONLY path (your 10 routing items): title + URL, nothing else.
    if _runtime_item_is_link_only(item):
        if url:
            text = f"{title}: <{url}>"
            sources.append({"url": url, "label": _title_for_url(url)})
        else:
            text = title
        return text, sources

    # Normal rich answer (used for other runtime items)
    parts = []
    main = _render_template(item.get("answer_template") or "", ctx).strip()
    if main:
        parts.append(main)

    steps = item.get("how_to_find") or []
    if steps:
        parts.append("**How to find it:**")
        for s in steps:
            parts.append(f"• {s}")

    if url:
        parts.append(f"Source: <{url}>")
        sources.append({"url": url, "label": _title_for_url(url)})

    return "\n".join(parts).strip(), sources

def _match_runtime_qna(prompt: str) -> dict | None:
    if not _RUNTIME_KB:
        return None
    for item in _RUNTIME_KB.get("qna", []):
        qe = item.get("question_exact") or ""
        if qe and _norm_contains(prompt, qe):
            return item
        for p in (item.get("patterns") or []):
            if p and _norm_contains(prompt, p):
                return item
    return None

def _match_personal(prompt: str) -> dict | None:
    if not _PERSONAL_KB:
        return None
    q = _normalize_text(prompt)
    for item in _PERSONAL_KB.get("qna", []):
        if item.get("question_exact") and _norm_contains(q, item["question_exact"]):
            return item
        for p in item.get("patterns", []):
            if p and _norm_contains(q, p):
                return item
    return None

# ---------- UI helpers ----------
def _md_link(url: str, label: str | None = None) -> str:
    try:
        host = urllib.parse.urlparse(url).netloc or url
    except Exception:
        host = url
    return f"[{label or host}]({url})"

def _title_for_url(url: str) -> str:
    """
    Prefer the filename if present (even if it has an extension),
    otherwise fall back to a tidy host name.
    """
    try:
        p = urllib.parse.urlparse(url)
        host = (p.netloc or "").lower()
        path_last = (p.path.rstrip("/").split("/")[-1] if p.path else "").replace("-", " ").strip()
    except Exception:
        host, path_last = "", ""

    if path_last:
        return path_last
    if host:
        parts = host.split(".")
        if len(parts) > 2:
            host = ".".join(parts[-2:])
        return host
    return url

# ---------- Query gating ----------
def _tokenize(text: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", text.lower()))

def _is_health_query(prompt: str) -> bool:
    toks = _tokenize(prompt)
    return any(t in toks for t in {
        "hiv","aids","prep","incidence","prevalence","who","unaids",
        "scorecard","statcompiler","phia","agyw","zomba","malawi","tanzania","kenya","mozambique"
    })

def _is_best_link_intent(prompt: str) -> bool:
    q = _normalize_text(prompt)
    return any(kw in q for kw in [
        "best link", "give me a link", "provide a link", "link for", "where can i find", "where can i get"
    ])

def _url_tokens(u: str) -> set[str]:
    try:
        p = urllib.parse.urlparse(u)
        host_parts = p.netloc.lower().split(".")
        path_parts = re.split(r"[^a-z0-9]+", p.path.lower())
        return {t for t in host_parts + path_parts if t}
    except Exception:
        return set()

def _pick_reference_url(prompt: str) -> str | None:
    if not REFERENCE_URLS:
        return None
    q = _tokenize(prompt)
    if "prep" in q: q.update({"pre","preexposure","prophylaxis"})
    if "hiv" in q: q.update({"aids"})
    if "who" in q: q.update({"world","health","organization"})
    if "kenya" in q: q.update({"ke"})
    if "zimbabwe" in q: q.update({"zw"})
    if "uganda" in q: q.update({"ug"})
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

# ---------- OpenSearch client (optional) ----------
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
            use_ssl=True, verify_certs=True,
            connection_class=RequestsHttpConnection,
            timeout=30, pool_maxsize=20,
        )
        _ = _os.ping()
        logger.info("OpenSearch client initialized.")
    except Exception as e:
        logger.error(f"OpenSearch init failed: {e}")
        _os = None
elif not _OPENSEARCH_AVAILABLE and cfg.OPENSEARCH_ENDPOINT:
    logger.warning("OpenSearch layer not available; COUNT disabled.")

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

# ---------- URL / source helpers ----------
def _clean_filename(s3_uri_or_url: str) -> str:
    u = s3_uri_or_url or ""
    try:
        if u.startswith("s3://"):
            part = u.split("/", 3)[-1]
            from urllib.parse import unquote
            return unquote(part.split("/")[-1]) or "Unknown source"
        if u.startswith("https://"):
            from urllib.parse import urlparse, unquote
            parsed = urlparse(u)
            part = parsed.path.lstrip("/")
            return unquote(part.split("/")[-1]) or "Unknown source"
        if u:
            return u.split("/")[-1] or u
        return "Unknown source"
    except Exception:
        return u

def _doc_url_from_s3_uri(s3_uri: str) -> str:
    """Return presigned HTTPS URL for own bucket, else public-style URL."""
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

def _unique_sources_by_docid(sources: list[dict]) -> list[dict]:
    """De-duplicate by original doc id (s3_uri) + page, ignoring presign params."""
    seen = set()
    out = []
    for s in sources or []:
        doc_id = s.get("doc_id") or s.get("url")
        page = s.get("page")
        key = (doc_id, page if isinstance(page, (int, float, str)) else None)
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out

# ---------- KB retrieval ----------
def _kb_retrieve(prompt: str, kb_id: str, k: int = 5) -> tuple[str, list[dict]]:
    """
    Returns (combined_text, sources[]). Each source includes:
      - url (presigned if same bucket)
      - label (filename)
      - page (int, optional)
      - score (float, optional)
      - doc_id (original s3://... URI)  <-- used for de-duplication
    """
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

        snippets = []
        sources = []
        for r in results:
            txt = (r.get("content") or {}).get("text", "")
            if txt:
                snippets.append(txt)

            loc = (r.get("location") or {}).get("s3Location") or {}
            s3_uri = loc.get("uri")  # original doc id
            score = r.get("score")
            page = (r.get("metadata") or {}).get("x-amz-bedrock-kb-document-page-number")

            # human-facing URL
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
            elif s3_uri and s3_uri.startswith("s3://"):
                url = _doc_url_from_s3_uri(s3_uri)

            src = {"url": url, "label": _clean_filename(s3_uri or url), "doc_id": s3_uri}
            if page is not None:
                try:
                    src["page"] = int(page)
                except Exception:
                    pass
            if isinstance(score, (int, float)):
                src["score"] = float(score)
            sources.append(src)

        sources = _unique_sources_by_docid(sources)
        return ("\n\n".join(snippets).strip(), sources[:k])
    except ClientError as e:
        logger.error(f"KB retrieve ClientError: {e}")
        return "", []
    except Exception as e:
        logger.error(f"KB retrieve unexpected error: {e}")
        return "", []

# ---------- Core talk path ----------
def _talk_link_only_best(connection_id: str, prompt: str):
    """
    Handle 'best link' intent: return one clean link (label = filename),
    no raw URL string in the chat body. Clickable link is in markdown text
    and repeated in the sources bubble. No model call here.
    """
    kb_text, kb_sources = _kb_retrieve(prompt, cfg.KNOWLEDGE_BASE_ID)
    if kb_sources:
        top = kb_sources[0]
        url = top.get("url")
        label = top.get("label") or (url and _clean_filename(url)) or "Source"
        text = f"**Best link:** {_md_link(url, label)}"
        _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": text + "\n"})
        _send_ws(connection_id, {"type": "sources", "statusCode": 200, "sources": [top]})
        _send_ws(connection_id, {"type": "end", "statusCode": 200})
        return True

    ref_url = _pick_reference_url(prompt)
    if ref_url:
        label = _title_for_url(ref_url)
        text = f"**Best link:** {_md_link(ref_url, label)}"
        _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": text + "\n"})
        _send_ws(connection_id, {"type": "sources", "statusCode": 200, "sources": [{"url": ref_url, "label": label}]})
        _send_ws(connection_id, {"type": "end", "statusCode": 200})
        return True

    return False

def _talk_with_optional_kb(connection_id: str, prompt: str):
    # If user asked for a "best link", do that and return
    if _is_best_link_intent(prompt):
        if _talk_link_only_best(connection_id, prompt):
            return

    # HEALTH GATE: only use KB & suggested refs for health-ish prompts
    health = _is_health_query(prompt)

    ref_url = None
    if health:
        try:
            ref_url = _pick_reference_url(prompt)
            if ref_url:
                _send_ws(connection_id, {
                    "type": "delta",
                    "statusCode": 200,
                    "format": "markdown",
                    "text": f"**Suggested reference:** {_md_link(ref_url, _title_for_url(ref_url))}\n\n"
                })
        except Exception:
            ref_url = None

    # Retrieve from KB only if health-related
    kb_text, kb_sources = ("", [])
    if health:
        kb_text, kb_sources = _kb_retrieve(prompt, cfg.KNOWLEDGE_BASE_ID)

    # Build message for model
    if kb_text:
        user_text = (
            "Use the following knowledge snippets as your primary source. If they do not fully cover "
            "the question, you may draw on general expertise to provide a helpful and accurate answer. "
            "Briefly state assumptions if needed and note any critical missing info.\n"
            f"(A helpful external reference may be: {ref_url or 'N/A'})\n"
            "<knowledge_source>\n"
            f"{kb_text}\n"
            "</knowledge_source>\n\n"
            f"User question: {prompt}"
        )
    else:
        user_text = (
            "Answer helpfully and accurately. If information is missing, say what would help.\n\n"
            f"User question: {prompt}"
        )

    messages = [{"role": "user", "content": [{"text": user_text}]}]
    system = [{"text": cfg.SYSTEM_PROMPT}] if cfg.SYSTEM_PROMPT else None

    # Stream answer
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
                _send_ws(connection_id, {"type": "delta", "statusCode": 200, "text": delta})
        elif "messageStop" in ev:
            break
        elif "internalServerException" in ev or "modelStreamErrorException" in ev \
                or "throttlingException" in ev or "validationException" in ev:
            err = ev.get("internalServerException") or ev.get("modelStreamErrorException") \
                  or ev.get("throttlingException") or ev.get("validationException")
            logger.error(f"Stream error: {err}")
            _end_with_error(connection_id, "Model streaming error.", 500)
            return

    # Sources: include suggested ref + KB sources (only if health); de-duped
    sources_to_send = []
    if health and ref_url:
        sources_to_send.append({"url": ref_url, "label": _title_for_url(ref_url), "score": None})
    if health and kb_sources:
        sources_to_send.extend(kb_sources)

    sources_to_send = _unique_sources_by_docid(sources_to_send)
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

        logger.info(f"START event={json.dumps({k: event[k] for k in ['prompt','connectionId'] if k in event})}")

        # Ensure runtime JSONs are loaded
        _ensure_config_loaded()

        # 1) Optional personal intercept (e.g., cat name)
        phit = _match_personal(prompt)
        if phit:
            ans = (phit.get("answer_template") or "OK").strip()
            _send_ws(connection_id, {"type": "delta", "statusCode": 200, "text": ans})
            _send_ws(connection_id, {"type": "end", "statusCode": 200})
            return {"statusCode": 200, "body": "PERSONAL_KB_OK"}

        # 2) Runtime QnA intercept (covers your 10 routing questions)
        rhit = _match_runtime_qna(prompt)
        if rhit:
            text, srcs = _answer_from_runtime_qna(rhit)
            if text:
                _send_ws(connection_id, {"type": "delta", "statusCode": 200, "format": "markdown", "text": text + "\n"})
            if srcs:
                _send_ws(connection_id, {"type": "sources", "statusCode": 200, "sources": srcs})
            _send_ws(connection_id, {"type": "end", "statusCode": 200})
            return {"statusCode": 200, "body": "RUNTIME_QNA_OK"}

        # 3) Otherwise do normal talk (health prompts = RAG; non-health = no RAG)
        _talk_with_optional_kb(connection_id, prompt)
        return {"statusCode": 200, "body": "OK"}

    except Exception as e:
        logger.error(f"Fatal handler error: {e}", exc_info=True)
        cid = event.get("connectionId")
        if cid:
            _end_with_error(cid, "Internal error.", 500)
        return {"statusCode": 500, "body": "Internal error"}