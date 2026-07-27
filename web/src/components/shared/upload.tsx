import { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { uploadFile, UploadPurpose } from '../../lib/upload';
import { COLOR_BORDER, COLOR_BG_SUBTLE, COLOR_TEXT_MUTED, COLOR_BRAND_PRIMARY } from '../../lib/theme';
import { notify } from './misc';

const TILE = 76;

/**
 * Multi-image picker backed by the real presign-then-PUT upload flow
 * (lib/upload.ts). Renders uploaded thumbnails with a remove button plus an
 * "add" tile; each pick uploads immediately and appends the returned public
 * URL to `value` — callers just wire `value`/`onChange` into their form
 * state and submit the URL array as-is (e.g. guarantee ticket `mediaUrls`).
 */
export function MediaUpload({
  value,
  onChange,
  purpose,
  max = 6,
  accept = 'image/jpeg,image/png,image/webp,image/heic',
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  purpose: UploadPurpose;
  max?: number;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const picked = Array.from(files).slice(0, Math.max(0, max - value.length));
    if (picked.length === 0) return;
    setUploading(true);
    try {
      const urls = await Promise.all(picked.map((f) => uploadFile(f, purpose)));
      onChange([...value, ...urls]);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'تعذّر رفع الملف', 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {value.map((url) => (
        <div key={url} className="relative shrink-0 rounded-xl overflow-hidden" style={{ width: TILE, height: TILE, background: COLOR_BG_SUBTLE }}>
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(value.filter((u) => u !== url))}
            aria-label="إزالة الصورة"
            className="absolute top-1 end-1 rounded-full flex items-center justify-center"
            style={{ width: 20, height: 20, background: 'rgba(0,0,0,0.55)' }}
          >
            <X size={13} color="#fff" />
          </button>
        </div>
      ))}
      {value.length < max && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="إضافة صورة"
          className="shrink-0 rounded-xl flex flex-col items-center justify-center gap-1 disabled:opacity-50"
          style={{ width: TILE, height: TILE, border: `1.5px dashed ${COLOR_BORDER}`, color: COLOR_TEXT_MUTED, background: 'transparent' }}
        >
          {uploading ? (
            <div className="animate-spin rounded-full" style={{ width: 18, height: 18, border: `2px solid ${COLOR_BORDER}`, borderTopColor: COLOR_BRAND_PRIMARY }} />
          ) : (
            <>
              <ImagePlus size={20} />
              <span style={{ fontSize: 10 }}>إضافة صورة</span>
            </>
          )}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
    </div>
  );
}
