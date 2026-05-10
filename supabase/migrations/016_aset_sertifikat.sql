-- Migration 016: Add sertifikat column to aset table
ALTER TABLE aset ADD COLUMN IF NOT EXISTS sertifikat TEXT;
