from __future__ import annotations

import re
from io import BytesIO

import ddddocr
from PIL import Image, ImageEnhance, ImageOps

_OCR = ddddocr.DdddOcr(show_ad=False)


def _eval_math(text: str) -> str | None:
    text = re.sub(r"\s+", "", text).replace("=", "").replace("?", "")
    text = text.replace("×", "x").replace("*", "x").replace("X", "x")
    match = re.search(r"(\d+)([+\-x])(\d+)", text)
    if not match:
        return None
    left, op, right = int(match.group(1)), match.group(2), int(match.group(3))
    if op == "+":
        return str(left + right)
    if op == "-":
        return str(left - right)
    return str(left * right)


def _to_png_bytes(img: Image.Image) -> bytes:
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _variants(img_bytes: bytes) -> list[bytes]:
    img = Image.open(BytesIO(img_bytes)).convert("RGB")
    variants: list[bytes] = [img_bytes]
    gray = ImageOps.grayscale(img)
    for scale in (2, 3):
        scaled = gray.resize((gray.width * scale, gray.height * scale), Image.Resampling.LANCZOS)
        variants.append(_to_png_bytes(scaled))
        for threshold in (100, 120, 140, 160, 180):
            bw = scaled.point(lambda p, t=threshold: 255 if p > t else 0)
            variants.append(_to_png_bytes(bw))
    for threshold in (100, 120, 140, 160, 180):
        bw = gray.point(lambda p, t=threshold: 255 if p > t else 0)
        variants.append(_to_png_bytes(bw))
    for enhancer, factor in ((ImageEnhance.Contrast, 2.0), (ImageEnhance.Sharpness, 2.5)):
        enhanced = enhancer(gray).enhance(factor)
        variants.append(_to_png_bytes(enhanced))
    variants.append(_to_png_bytes(ImageOps.invert(gray)))
    return variants


def solve_math_captcha(img_bytes: bytes) -> tuple[str | None, str | None]:
    for variant in _variants(img_bytes):
        raw = _OCR.classification(variant)
        answer = _eval_math(raw)
        if answer:
            return answer, raw
    return None, None