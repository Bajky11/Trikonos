import { useId, useRef, useState } from "react";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import { Box, Button, Typography } from "@mui/material";

const formats = {
  png: {
    accept: "image/png,.png",
    extensions: "PNG",
    pick: "Vybrat PNG",
    replace: "Vybrat jiné PNG",
  },
  photo: {
    accept: "image/jpeg,image/png,image/webp",
    extensions: "JPG, PNG nebo WEBP",
    pick: "Vybrat fotografii",
    replace: "Vybrat jinou fotografii",
  },
};

export function ImageDropzone({
  label,
  format,
  file,
  onChange,
  helperText,
  disabled = false,
}: {
  label: string;
  format: keyof typeof formats;
  file: File | null;
  onChange: (file: File | null) => void;
  helperText?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const { accept, extensions, pick, replace } = formats[format];
  const select = (files: FileList | null) => {
    if (disabled || !files?.length) return;
    const candidate = files[0];
    const matches = candidate.type
      ? accept.split(",").includes(candidate.type)
      : format === "png" && /\.png$/i.test(candidate.name);
    if (files.length !== 1 || !matches) {
      onChange(null);
      setError(`Vyberte jeden soubor ve formátu ${extensions}.`);
      return;
    }
    setError("");
    onChange(candidate);
  };

  return (
    <Box sx={{ minWidth: 0 }}>
      <input
        ref={input}
        type="file"
        accept={accept}
        aria-label={label}
        hidden
        disabled={disabled}
        onChange={(event) => {
          select(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <Box
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled ? "none" : "copy";
          setDragging(!disabled);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(false);
          select(event.dataTransfer.files);
        }}
      >
        <Button
          type="button"
          variant="outlined"
          startIcon={<CloudUploadOutlinedIcon />}
          fullWidth
          disabled={disabled}
          aria-describedby={helperText ? hintId : undefined}
          onClick={() => input.current?.click()}
          sx={{
            justifyContent: "flex-start",
            textAlign: "left",
            minHeight: 76,
            px: 1.5,
            borderStyle: "dashed",
            borderRadius: 2,
            bgcolor: dragging && !disabled ? "action.selected" : "transparent",
          }}
        >
          <Box component="span" sx={{ display: "grid", lineHeight: 1.3 }}>
            {file ? replace : pick}
            <Typography component="span" variant="caption" color="text.secondary">
              nebo sem přetáhněte soubor
            </Typography>
          </Box>
        </Button>
      </Box>
      {helperText && (
        <Typography id={hintId} variant="caption" color="text.secondary">
          {helperText}
        </Typography>
      )}
      {file && (
        <Typography variant="body2" role="status" sx={{ overflowWrap: "anywhere" }}>
          Vybraný soubor: {file.name}
        </Typography>
      )}
      {error && (
        <Typography variant="body2" color="error" role="alert">
          {error}
        </Typography>
      )}
    </Box>
  );
}
