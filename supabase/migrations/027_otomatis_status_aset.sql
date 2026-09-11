-- Status aset berasal dari data operasional, bukan dipilih manual.
CREATE OR REPLACE FUNCTION public.sinkronkan_status_aset(p_aset_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.kerja_sama
    WHERE aset_id = p_aset_id
      AND status IN ('aktif', 'sp1', 'sp2', 'sp3')
  ) THEN
    UPDATE public.aset SET status = 'aktif_ks' WHERE id = p_aset_id;
  ELSIF EXISTS (
    SELECT 1 FROM public.prospek_mitra
    WHERE aset_id = p_aset_id AND progress = 'negosiasi'
  ) THEN
    UPDATE public.aset SET status = 'negosiasi' WHERE id = p_aset_id;
  ELSIF EXISTS (
    SELECT 1 FROM public.prospek_mitra
    WHERE aset_id = p_aset_id AND progress <> 'gagal'
  ) THEN
    UPDATE public.aset SET status = 'prospek' WHERE id = p_aset_id;
  ELSIF EXISTS (
    SELECT 1 FROM public.kerja_sama WHERE aset_id = p_aset_id
  ) THEN
    UPDATE public.aset SET status = 'selesai' WHERE id = p_aset_id;
  ELSE
    UPDATE public.aset SET status = 'pipeline' WHERE id = p_aset_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.pic_u_status_aset_dari_prospek()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.sinkronkan_status_aset(COALESCE(NEW.aset_id, OLD.aset_id));
  IF TG_OP = 'UPDATE' AND NEW.aset_id IS DISTINCT FROM OLD.aset_id THEN
    PERFORM public.sinkronkan_status_aset(OLD.aset_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.pic_u_status_aset_dari_kerja_sama()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.sinkronkan_status_aset(COALESCE(NEW.aset_id, OLD.aset_id));
  IF TG_OP = 'UPDATE' AND NEW.aset_id IS DISTINCT FROM OLD.aset_id THEN
    PERFORM public.sinkronkan_status_aset(OLD.aset_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_status_aset_dari_prospek ON public.prospek_mitra;
CREATE TRIGGER trg_status_aset_dari_prospek
AFTER INSERT OR UPDATE OR DELETE ON public.prospek_mitra
FOR EACH ROW EXECUTE FUNCTION public.pic_u_status_aset_dari_prospek();

DROP TRIGGER IF EXISTS trg_status_aset_dari_kerja_sama ON public.kerja_sama;
CREATE TRIGGER trg_status_aset_dari_kerja_sama
AFTER INSERT OR UPDATE OR DELETE ON public.kerja_sama
FOR EACH ROW EXECUTE FUNCTION public.pic_u_status_aset_dari_kerja_sama();

-- Selaraskan aset yang sudah ada saat migrasi dijalankan.
SELECT public.sinkronkan_status_aset(id) FROM public.aset;
