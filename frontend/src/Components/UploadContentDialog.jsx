// src/Components/UploadContentDialog.jsx
// "Upload Content" modal: lets a user submit a document for i2i to review.
// Files go to S3 submitted_docs/ (NOT indexed by Tobi until i2i approves them).
import React, { useRef, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import { UPLOAD_API, UPLOAD_BUTTON_COLOR } from "../utilities/constants";

const MAX_MB = 50;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const ALLOWED_EXT = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv", "txt", "rtf", "odt"];
const ACCEPT = ALLOWED_EXT.map((e) => `.${e}`).join(",");

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validate(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (!file.name.includes(".") || !ALLOWED_EXT.includes(ext)) {
    return "Please choose a PDF, Word, PowerPoint, Excel, CSV, or text file.";
  }
  if (file.size === 0) return "That file looks empty. Please choose another.";
  if (file.size > MAX_BYTES) return `Files must be ${MAX_MB} MB or smaller.`;
  return "";
}

async function uploadFile(file) {
  if (!UPLOAD_API) throw new Error("Uploads aren't available right now.");
  const contentType = file.type || "application/octet-stream";

  // 1) Ask the backend for a short-lived, locked-down upload form
  const presignRes = await fetch(UPLOAD_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType, size: file.size }),
  });
  const presign = await presignRes.json().catch(() => ({}));
  if (!presignRes.ok || !presign.url) {
    throw new Error(presign.error || "Could not start the upload.");
  }

  // 2) Send the file straight to S3 (file must be the last form field)
  const form = new FormData();
  Object.entries(presign.fields || {}).forEach(([k, v]) => form.append(k, v));
  form.append("file", file);
  const s3Res = await fetch(presign.url, { method: "POST", body: form });
  if (!s3Res.ok) throw new Error("The upload didn't go through.");
}

export default function UploadContentDialog({ open, onClose }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | uploading | success
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setFile(null);
    setStatus("idle");
    setError("");
    setDragOver(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = () => {
    if (status === "uploading") return; // don't drop an in-flight upload
    onClose();
    // wait for the close animation before clearing content
    setTimeout(reset, 200);
  };

  const pick = (f) => {
    if (!f) return;
    const msg = validate(f);
    setError(msg);
    setFile(msg ? null : f);
  };

  const handleSubmit = async () => {
    if (!file) return;
    setStatus("uploading");
    setError("");
    try {
      await uploadFile(file);
      setStatus("success");
    } catch (e) {
      console.error("Upload Content failed:", e);
      setError(e.message || "Something went wrong. Please try again.");
      setStatus("idle");
    }
  };

  const brandButtonSx = {
    bgcolor: UPLOAD_BUTTON_COLOR,
    color: "#FFFFFF",
    textTransform: "none",
    fontWeight: 500,
    borderRadius: "6px",
    px: 2.5,
    "&:hover": { bgcolor: UPLOAD_BUTTON_COLOR, filter: "brightness(1.15)" },
  };

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm" aria-labelledby="upload-content-title">
      <DialogTitle id="upload-content-title" sx={{ pr: 6, fontWeight: 600, color: "#222222" }}>
        {status === "success" ? "Submitted" : "Upload Content"}
        <IconButton
          aria-label="Close"
          onClick={handleClose}
          disabled={status === "uploading"}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      {status === "success" ? (
        <>
          <DialogContent sx={{ textAlign: "center", py: 4 }}>
            <CheckCircleIcon sx={{ fontSize: 56, color: "#2E7D32", mb: 1 }} />
            <Typography variant="h6" sx={{ fontWeight: 600, color: "#222222", mb: 1 }}>
              Thank you!
            </Typography>
            <Typography sx={{ color: "#444444" }}>
              i2i will review the information to see if it should be added to Tobi's knowledge.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleClose} variant="contained" sx={brandButtonSx}>
              Done
            </Button>
          </DialogActions>
        </>
      ) : (
        <>
          <DialogContent>
            <Typography sx={{ color: "#444444", mb: 2 }}>
              Have a document that could help Tobi? Share it here. The i2i team reviews every
              submission before anything is added to Tobi's knowledge.
            </Typography>

            <Box
              role="button"
              tabIndex={0}
              onClick={() => status !== "uploading" && inputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && status !== "uploading") {
                  e.preventDefault();
                  inputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (status !== "uploading") pick(e.dataTransfer.files?.[0]);
              }}
              sx={{
                border: "2px dashed",
                borderColor: dragOver ? UPLOAD_BUTTON_COLOR : "#C9C9C9",
                bgcolor: dragOver ? "rgba(72,32,69,0.05)" : "#FAFAFA",
                borderRadius: "8px",
                p: { xs: 2.5, sm: 3.5 },
                textAlign: "center",
                cursor: status === "uploading" ? "default" : "pointer",
                transition: "border-color 120ms, background-color 120ms",
                outline: "none",
                "&:focus-visible": { borderColor: UPLOAD_BUTTON_COLOR },
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => pick(e.target.files?.[0])}
              />
              {file ? (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1.5 }}>
                  <InsertDriveFileOutlinedIcon sx={{ color: UPLOAD_BUTTON_COLOR }} />
                  <Box sx={{ textAlign: "left", minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, color: "#222222", wordBreak: "break-all" }}>
                      {file.name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#666666", fontSize: "14px" }}>
                      {formatSize(file.size)} · click to change
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <>
                  <CloudUploadIcon sx={{ fontSize: 40, color: UPLOAD_BUTTON_COLOR, mb: 1 }} />
                  <Typography sx={{ color: "#222222", fontWeight: 500 }}>
                    Click to choose a file, or drag it here
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#666666", fontSize: "14px", mt: 0.5 }}>
                    PDF, Word, PowerPoint, Excel, CSV, or text · up to {MAX_MB} MB
                  </Typography>
                </>
              )}
            </Box>

            {error && (
              <Typography role="alert" sx={{ color: "#C62828", mt: 1.5, fontSize: "14px" }}>
                {error}
              </Typography>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={handleClose} disabled={status === "uploading"} sx={{ textTransform: "none", color: "#444444" }}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              variant="contained"
              disabled={!file || status === "uploading"}
              startIcon={status === "uploading" ? <CircularProgress size={18} sx={{ color: "#FFFFFF" }} /> : null}
              sx={brandButtonSx}
            >
              {status === "uploading" ? "Uploading…" : "Submit"}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
