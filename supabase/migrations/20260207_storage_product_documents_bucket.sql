-- ============================================
-- Migration: Create product-documents storage bucket
-- ============================================
-- Bucket pentru documentele PDF ale produselor (licitații)
-- Creează bucketul doar dacă nu există

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product-documents') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'product-documents',
      'product-documents',
      true,
      20971520,
      ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    );
  END IF;
END $$;
