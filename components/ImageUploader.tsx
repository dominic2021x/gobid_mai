"use client";

import React, { useState, useRef } from 'react';
import Image from 'next/image';
import { uploadImageFile } from '@/lib/upload/client-image-upload';

interface UploadResult {
  success: boolean;
  url?: string;
  fileName?: string;
  format?: string;
  width?: number;
  height?: number;
  originalSize?: number;
  optimizedSize?: number;
  compressionRatio?: string;
  warning?: string;
  error?: string;
}

interface ImageUploaderProps {
  onUploadComplete?: (result: UploadResult) => void;
  maxFiles?: number;
  existingImages?: string[];
  onImagesChange?: (images: string[]) => void;
  disabled?: boolean;
}

export default function ImageUploader({
  onUploadComplete,
  maxFiles = 50,
  existingImages = [],
  onImagesChange,
  disabled = false,
}: ImageUploaderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    fileName: string;
    progress: number;
  } | null>(null);
  const [preview, setPreview] = useState<string[]>(existingImages);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Check if adding these files would exceed the limit
    const totalAfterUpload = preview.length + files.length;
    if (totalAfterUpload > maxFiles) {
      setError(
        `Poți adăuga doar ${maxFiles - preview.length} imagini în plus. Limita maximă este de ${maxFiles} imagini.`
      );
      e.target.value = '';
      return;
    }

    setError(null);
    setIsUploading(true);

    const newImages: string[] = [];
    const newResults: UploadResult[] = [];

    // Upload files sequentially
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      setUploadProgress({
        fileName: file.name,
        progress: ((i + 1) / files.length) * 100,
      });

      try {
        const up = await uploadImageFile(file);
        if (up.success && up.url) {
          const result: UploadResult = {
            success: true,
            url: up.url,
            fileName: file.name,
            originalSize: file.size,
            optimizedSize: file.size,
            compressionRatio: up.duplicate ? '0%' : undefined,
            warning: up.duplicate ? 'Imagine existentă (hash identic).' : undefined,
          };
          newImages.push(up.url);
          newResults.push(result);
          if (onUploadComplete) {
            onUploadComplete(result);
          }
        } else {
          setError((!up.success && up.error) || 'Eroare la încărcarea imaginii.');
        }
      } catch (err: any) {
        setError(err.message || 'Eroare la încărcarea imaginii.');
      }
    }

    // Update state
    const updatedImages = [...preview, ...newImages];
    setPreview(updatedImages);
    setUploadResults([...uploadResults, ...newResults]);
    
    if (onImagesChange) {
      onImagesChange(updatedImages);
    }

    setIsUploading(false);
    setUploadProgress(null);
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    const updated = preview.filter((_, i) => i !== index);
    setPreview(updated);
    
    // Also remove from results
    const updatedResults = uploadResults.filter((_, i) => i !== index);
    setUploadResults(updatedResults);
    
    if (onImagesChange) {
      onImagesChange(updated);
    }
  };

  const triggerFileSelect = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="w-full">
      {/* Upload Area */}
      <div
        onClick={triggerFileSelect}
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
          disabled || preview.length >= maxFiles
            ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60 cursor-not-allowed'
            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-gray-800/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/svg+xml"
          onChange={handleFileSelect}
          disabled={disabled || preview.length >= maxFiles}
          className="hidden"
        />

        {isUploading ? (
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
            <p className="text-gray-600 dark:text-gray-400 mb-2">
              Se încarcă {uploadProgress?.fileName}...
            </p>
            {uploadProgress && (
              <div className="w-full max-w-xs bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress.progress}%` }}
                ></div>
              </div>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-500">
              Se încarcă imaginea…
            </p>
          </div>
        ) : (
          <>
            <i
              className={`ri-upload-cloud-2-line text-4xl mb-2 ${
                disabled || preview.length >= maxFiles
                  ? 'text-gray-300 dark:text-gray-600'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            ></i>
            <p
              className={`mb-2 ${
                disabled || preview.length >= maxFiles
                  ? 'text-gray-400 dark:text-gray-600'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {preview.length >= maxFiles
                ? `Limita de ${maxFiles} imagini atinsă`
                : 'Trage fișierele aici sau click pentru a selecta'}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              JPG, PNG, WebP, GIF, SVG — încărcare directă în stocare (R2)
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Max 5MB per fișier • {preview.length}/{maxFiles} imagini
            </p>
          </>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Upload Results Summary */}
      {uploadResults.length > 0 && !isUploading && (
        <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300 mb-2">
            Încărcare reușită! ✓
          </p>
          <div className="text-xs text-green-700 dark:text-green-400 space-y-1">
            {uploadResults.slice(-3).map((result, idx) => (
              result.url && (
                <div key={idx}>
                  {result.compressionRatio && parseFloat(result.compressionRatio) > 0 && (
                    <span>
                      {result.fileName}: {result.compressionRatio} mai mic ({result.format?.toUpperCase()})
                    </span>
                  )}
                </div>
              )
            ))}
          </div>
        </div>
      )}

      {/* Image Preview Grid */}
      {preview.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Imagini încărcate ({preview.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {preview.map((imageUrl, index) => (
              <div key={index} className="relative group">
                <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600">
                  <Image
                    src={imageUrl}
                    alt={`Upload ${index + 1}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                </div>
                {!disabled && (
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    title="Șterge imagine"
                  >
                    <i className="ri-close-line text-sm"></i>
                  </button>
                )}
                {/* Format badge */}
                {uploadResults[index]?.format && (
                  <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 text-white text-xs rounded backdrop-blur-sm">
                    {uploadResults[index].format?.toUpperCase()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
