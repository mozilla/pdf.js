#!/usr/bin/env python3
# Copyright 2026 Mozilla Foundation
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0

"""Generate the Digital signature properties test-PDF corpus.

Produces one PDF per verification UI state. Each PDF embeds a PKCS#7
detached signature minted by ``pycms.py`` from mozilla-central, with the
``messageDigest`` matching the actual ``/ByteRange`` bytes of the PDF.

The visible page content of every PDF is the description of the expected
UI state for that case — open the file in Firefox and compare what the
page says against what the Digital signature properties doorhanger renders.

Run from the pdf.js root:

    python3 test/pdfs/sig_corpus/generate.py

Requires a built mozilla-central checkout so we can call its bundled
pycms.py / pycert.py / pykey.py and reuse the vendored Python deps under
third_party/python. The checkout location is resolved in this order:

  1. The --mozilla-central CLI flag (highest priority).
  2. The MOZILLA_CENTRAL_SRC environment variable.
  3. /opt/mozilla/firefox (fallback default; will print a warning).
"""

import argparse
import base64
import hashlib
import os
import re
import subprocess
import sys
from pathlib import Path

CORPUS_DIR = Path(__file__).resolve().parent

# Default location, used only when no CLI flag or env var overrides it.
# Patched at runtime in main() once the path is resolved.
DEFAULT_MOZILLA_CENTRAL_DIR = Path("/opt/mozilla/firefox")
FIREFOX_DIR = DEFAULT_MOZILLA_CENTRAL_DIR
TOOLS_DIR = FIREFOX_DIR / "security/manager/tools"
PYCMS = TOOLS_DIR / "pycms.py"


def _resolve_mozilla_central_dir(cli_value):
    """CLI flag → MOZILLA_CENTRAL_SRC env var → default."""
    if cli_value:
        return Path(cli_value).expanduser().resolve()
    env = os.environ.get("MOZILLA_CENTRAL_SRC")
    if env:
        return Path(env).expanduser().resolve()
    sys.stderr.write(
        f"warning: no --mozilla-central / MOZILLA_CENTRAL_SRC set, "
        f"falling back to {DEFAULT_MOZILLA_CENTRAL_DIR}\n"
    )
    return DEFAULT_MOZILLA_CENTRAL_DIR

# Vendored Python modules pycms transitively imports.
VENDORED_DEPS = ["ecdsa", "rsa", "pyasn1", "pyasn1_modules", "six"]

# /Contents placeholder is sized so any single PKCS#7 we generate fits.
# The blobs we mint are ~1.2 KB each, so 4 KB of payload = 8192 hex chars.
PLACEHOLDER_PKCS7_LEN = 4096


def python_path_for_pycms():
    parts = [str(FIREFOX_DIR / "third_party/python" / dep) for dep in VENDORED_DEPS]
    parts.append(str(TOOLS_DIR))
    return os.pathsep.join(parts)


def run_pycms(spec_text):
    """Invoke pycms.py with the given spec, return raw DER bytes of the PKCS#7."""
    env = os.environ.copy()
    env["PYTHONPATH"] = python_path_for_pycms()
    proc = subprocess.run(
        [sys.executable, str(PYCMS)],
        input=spec_text.encode("ascii"),
        env=env,
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        sys.stderr.write(proc.stderr.decode("utf-8", "replace"))
        raise SystemExit(f"pycms.py failed for spec:\n{spec_text}")
    pem = proc.stdout.decode("ascii")
    body = re.sub(r"(-----.*?-----|\s)", "", pem)
    return base64.b64decode(body)


# ---------------------------------------------------------------------
# Tiny PDF builder
# ---------------------------------------------------------------------


def _wrap_lines(text, max_width=72):
    out = []
    for paragraph in text.split("\n"):
        if not paragraph:
            out.append("")
            continue
        words = paragraph.split(" ")
        line = ""
        for w in words:
            if not line:
                line = w
            elif len(line) + 1 + len(w) <= max_width:
                line += " " + w
            else:
                out.append(line)
                line = w
        if line:
            out.append(line)
    return out


_ASCII_REPLACEMENTS = {
    "—": "--",  # em dash
    "–": "-",   # en dash
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "…": "...",
    "→": "->",
    "←": "<-",
    "×": "x",
    "✓": "v",
    "✗": "x",
}


def _escape_pdf_string(s):
    for src, dst in _ASCII_REPLACEMENTS.items():
        s = s.replace(src, dst)
    # Strip any remaining non-ASCII characters as a safety net.
    s = s.encode("ascii", "replace").decode("ascii")
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _content_stream_for(text):
    """Build a content stream that paints the text top-down with Helvetica."""
    lines = _wrap_lines(text)
    cmds = ["BT", "/F1 11 Tf", "12 TL", "50 780 Td"]
    for i, line in enumerate(lines):
        if i == 0:
            cmds.append(f"({_escape_pdf_string(line)}) Tj")
        else:
            cmds.append(f"T*")
            cmds.append(f"({_escape_pdf_string(line)}) Tj")
    cmds.append("ET")
    return "\n".join(cmds).encode("latin-1")


class PdfBuilder:
    """Minimal one-page PDF builder with a single /Sig field.

    Returned bytes have placeholder ByteRange [0 0 0 0] and a /Contents hex
    string of zero bytes. The caller patches ByteRange and /Contents in
    place after computing the offsets.
    """

    def __init__(self, page_text, sub_filter="/adbe.pkcs7.detached"):
        self.page_text = page_text
        self.sub_filter = sub_filter

    def build(self):
        contents_stream = _content_stream_for(self.page_text)

        objs = {}
        objs[1] = (
            b"<< /Type /Catalog /Pages 2 0 R "
            b"/AcroForm << /Fields [4 0 R] /SigFlags 3 >> >>"
        )
        objs[2] = b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>"
        objs[3] = (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
            b"/Contents 7 0 R /Resources << /Font << /F1 8 0 R >> >> >>"
        )
        objs[4] = (
            b"<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature1) "
            b"/V 5 0 R /Rect [0 0 0 0] /F 4 /P 3 0 R >>"
        )
        # Object 5 (the /Sig dict) is built later because it contains the
        # placeholders we need to patch.
        objs[7] = (
            b"<< /Length " + str(len(contents_stream)).encode("ascii") + b" >>\n"
            b"stream\n" + contents_stream + b"\nendstream"
        )
        objs[8] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"

        # Emit header + objects 1-4, then build the /Sig dict knowing
        # /Contents will sit at a precise offset.
        chunks = [b"%PDF-1.7\n%\xc2\xa5\xc2\xb1\xc3\xab\n"]
        offsets = {}

        def emit_obj(num, body):
            header = f"{num} 0 obj\n".encode("ascii")
            offsets[num] = sum(len(c) for c in chunks)
            chunks.append(header + body + b"\nendobj\n")

        emit_obj(1, objs[1])
        emit_obj(2, objs[2])
        emit_obj(3, objs[3])
        emit_obj(4, objs[4])

        # Object 5 — the /Sig dict. We build the prefix, capture the
        # offset of the '<' that starts /Contents, append the placeholder
        # zeros, then continue with the rest.
        sig_prefix = (
            b"<< /Type /Sig "
            b"/Filter /Adobe.PPKLite "
            b"/SubFilter " + self.sub_filter.encode("ascii") + b" "
            b"/M (D:20260509000000Z) "
            b"/Reason (Test signature for pdf.js Digital signature properties UI) "
            b"/ByteRange [0000000000 0000000000 0000000000 0000000000] "
            b"/Contents <"
        )
        sig_suffix_zeros = b"0" * (PLACEHOLDER_PKCS7_LEN * 2)
        sig_suffix_close = b"> >>"

        obj5_header = b"5 0 obj\n"
        offsets[5] = sum(len(c) for c in chunks)
        chunks.append(obj5_header + sig_prefix)
        contents_start_in_obj = sum(len(c) for c in chunks) - 1  # the '<' byte
        chunks.append(sig_suffix_zeros)
        chunks.append(sig_suffix_close)
        chunks.append(b"\nendobj\n")

        emit_obj(7, objs[7])
        emit_obj(8, objs[8])

        # xref + trailer.
        xref_offset = sum(len(c) for c in chunks)
        xref_lines = [b"xref\n0 9\n", b"0000000000 65535 f \n"]
        for num in range(1, 9):
            if num == 6:
                xref_lines.append(b"0000000000 65535 f \n")
                continue
            off = offsets[num]
            xref_lines.append(f"{off:010d} 00000 n \n".encode("ascii"))
        chunks.extend(xref_lines)
        chunks.append(
            b"trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n"
            + str(xref_offset).encode("ascii")
            + b"\n%%EOF\n"
        )

        pdf = b"".join(chunks)
        # Locate placeholders in the final byte string.
        contents_open = pdf.index(b"/Contents <") + len(b"/Contents ")
        # contents_open points at '<'; the hex blob starts right after.
        hex_start = contents_open + 1
        hex_end = hex_start + PLACEHOLDER_PKCS7_LEN * 2
        assert pdf[hex_start:hex_end] == sig_suffix_zeros
        assert pdf[hex_end:hex_end + 1] == b">"

        return bytearray(pdf), contents_open, hex_start, hex_end


def _patch_byte_range(pdf, byte_range):
    placeholder = b"/ByteRange [0000000000 0000000000 0000000000 0000000000]"
    a, b_, c, d = byte_range
    replacement = (
        f"/ByteRange [{a:010d} {b_:010d} {c:010d} {d:010d}]".encode("ascii")
    )
    assert len(replacement) == len(placeholder)
    idx = pdf.index(placeholder)
    pdf[idx:idx + len(placeholder)] = replacement


def _splice_pkcs7(pdf, hex_start, hex_end, pkcs7_der):
    pkcs7_hex = pkcs7_der.hex().upper().encode("ascii")
    if len(pkcs7_hex) > (hex_end - hex_start):
        raise SystemExit(
            f"PKCS#7 ({len(pkcs7_hex) // 2} bytes) larger than placeholder "
            f"({(hex_end - hex_start) // 2})"
        )
    padded = pkcs7_hex.ljust(hex_end - hex_start, b"0")
    pdf[hex_start:hex_end] = padded


# ---------------------------------------------------------------------
# Cases
# ---------------------------------------------------------------------


CASES = []


def _register(name, page_text, spec_template, *, sub_filter="/adbe.pkcs7.detached", post_process=None):
    """Register a single-signature case.

    ``spec_template`` is a string with ``{sha256}`` replaced by the
    computed digest at generation time.
    ``post_process(pdf)`` runs after splicing the PKCS#7, allowing the
    "invalid" case to flip a byte inside the ByteRange.
    """
    CASES.append({
        "name": name,
        "page_text": page_text,
        "spec_template": spec_template,
        "sub_filter": sub_filter,
        "post_process": post_process,
    })


PAGE_HEADER = """\
Digital signature properties — pdf.js test corpus
=========================================

This PDF is part of the manual-test corpus for the Signature
Properties UI. The text below describes what the toolbar button
and the doorhanger should look like when this file is opened in
a Firefox build with
security.pdf_signature_verification.enable_test_trust_anchors
set to true.

"""

_register(
    "signed_verified",
    PAGE_HEADER + """\
Expected verification state: VERIFIED

Toolbar icon:    GREEN circle with white check.
Banner:          GREEN. "Document signed and verified".
Status row:      GREEN check, "Status: Signature verified".
Certificate row: GREEN check, "Certificate: Trusted (pdf-sign-ca)".
                 (Green only because this is the top-level card AND
                 every signature in the document is verified.)
"View certificate" link below the timestamp opens about:certificate.
No sub-signatures.
""",
    """\
sha256:{sha256}
signer:
issuer:pdf-sign-ca
subject:test-pdf-signer
""",
)

_register(
    "signed_untrusted",
    PAGE_HEADER + """\
Expected verification state: UNTRUSTED

The signing certificate is self-signed and does not chain to any
trusted root, so even with the test trust anchors pref enabled the
chain validation reports SEC_ERROR_UNKNOWN_ISSUER.

Toolbar icon:    ORANGE circle with white exclamation.
Banner:          ORANGE. "Document signed with a certificate that
                 is not trusted".
Status row:      grey check, "Status: Signature verified".
Certificate row: orange exclamation, "Certificate: Unknown issuer
                 (Untrusted Self-Signed Test Root)" -- the
                 parenthetical is the issuer CN from the cert.
""",
    """\
sha256:{sha256}
signer:
issuer:Untrusted Self-Signed Test Root
subject:Untrusted Self-Signed Test Root
""",
)

_register(
    "signed_expired",
    PAGE_HEADER + """\
Expected verification state: EXPIRED

The signer is issued by pdf-sign-ca-expired, whose validity ended
in 2020. The CMS signature itself is fine (NS_OK) but chain
validation reports SEC_ERROR_EXPIRED_ISSUER_CERTIFICATE.

Toolbar icon:    ORANGE circle with white exclamation.
Banner:          ORANGE. "Document signed with an expired
                 certificate".
Status row:      grey check, "Status: Signature verified" -- the
                 cryptographic signature is fine, only the
                 certificate has expired.
Certificate row: orange exclamation, "Certificate: Expired
                 (Dec 31, 2020)" -- the parenthetical is the
                 leaf cert's notAfter date.
""",
    """\
sha256:{sha256}
signer:
issuer:pdf-sign-ca-expired
subject:test-pdf-signer-expired
""",
)


def _tamper_byterange(pdf):
    # Flip one byte inside the page content stream so the CMS hash
    # check fails.
    marker = b"signed_invalid"
    # The page text contains the file's name, so flipping a letter inside
    # the marker is guaranteed to fall within the ByteRange.
    idx = pdf.index(marker)
    pdf[idx] = ord("S") if pdf[idx] == ord("s") else ord("s")


_register(
    "signed_invalid",
    PAGE_HEADER + """\
Expected verification state: INVALID — signed_invalid

After signing, one byte inside the document was flipped, so the
PKCS#7 messageDigest no longer matches the actual ByteRange data.
NSS returns SEC_ERROR_PKCS7_BAD_SIGNATURE — the signature is no
longer valid evidence that the document is intact.

Toolbar icon:    RED circle with white cross.
Banner:          RED. "Document has an invalid signature".
Status row:      red cross, "Status: Signature invalid".
Certificate row: green check (cert was fine, only the signature
                 broke), "Certificate: Trusted (pdf-sign-ca)".
""",
    """\
sha256:{sha256}
signer:
issuer:pdf-sign-ca
subject:test-pdf-signer
""",
    post_process=_tamper_byterange,
)


_register(
    "signed_unknown",
    PAGE_HEADER + """\
Expected verification state: UNKNOWN (unsupported)

The /Sig dict uses /SubFilter /ETSI.CAdES.detached, which pdf.js
maps to signatureType: null and never sends to NSS. The result
short-circuits to status: unknown without any cryptographic check.

Toolbar icon:    RED circle with white cross (verification failed).
Banner:          RED. "Document signed but the signature could
                 not be verified".
Status row:      red cross, "Status: Unable to verify (unsupported)".
Certificate row: red cross, "Certificate: Unavailable".
No "View certificate" button (no certificate to show).
""",
    # Spec is irrelevant (we do not actually call pycms for this case);
    # the placeholder zeros stay in /Contents.
    None,
    sub_filter="/ETSI.CAdES.detached",
)


# ---------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------


def _build_single(case):
    builder = PdfBuilder(case["page_text"], sub_filter=case["sub_filter"])
    pdf, contents_open, hex_start, hex_end = builder.build()
    file_len = len(pdf)
    a = 0
    b = contents_open  # bytes up to and including '<'? We want bytes up to '<' EXclusive.
    # /Contents <abcdef...> — the bytes covered by ByteRange are everything
    # except the hex string between '<' and '>'. So b = contents_open + 1
    # (include the '<') and c = hex_end (the '>'), d = file_len - hex_end.
    b = contents_open + 1
    c = hex_end
    d = file_len - hex_end
    _patch_byte_range(pdf, (a, b, c, d))

    if case["spec_template"] is None:
        # "unknown" case — leave /Contents zeros.
        return pdf

    digest = hashlib.sha256(bytes(pdf[a:a + b]) + bytes(pdf[c:c + d])).hexdigest()
    spec_text = case["spec_template"].format(sha256=digest)
    pkcs7_der = run_pycms(spec_text)
    _splice_pkcs7(pdf, hex_start, hex_end, pkcs7_der)

    if case.get("post_process"):
        case["post_process"](pdf)

    return pdf


# Multi-signature cases use incremental updates: build an inner-signed
# PDF first, then append additional objects + a second /Sig field whose
# /ByteRange covers the entire updated file.

def _build_multi(name, page_text, inner_spec_template, outer_spec_template):
    """Two-signature PDF.

    The inner signature is created normally over a single-page PDF.
    Then we incrementally append a new /AcroForm referencing both Sig
    fields and a second /Sig dict whose /ByteRange covers the full
    file. Both signatures are independent CMS messages over their own
    /ByteRange spans, exactly the pattern issue17169.pdf uses.
    """
    inner = PdfBuilder(page_text, sub_filter="/adbe.pkcs7.detached")
    pdf, c_open, h_start, h_end = inner.build()
    a, b = 0, c_open + 1
    c = h_end
    d = len(pdf) - h_end
    _patch_byte_range(pdf, (a, b, c, d))
    digest = hashlib.sha256(bytes(pdf[a:a + b]) + bytes(pdf[c:c + d])).hexdigest()
    pkcs7_der = run_pycms(inner_spec_template.format(sha256=digest))
    _splice_pkcs7(pdf, h_start, h_end, pkcs7_der)

    inner_pdf = bytes(pdf)

    # Incremental update: append updated catalog with a second /Sig field
    # plus the new /Sig dict + xref + trailer. Each new object gets a new
    # number; we reuse 9, 10, 11, 12 for second sig field, second sig
    # dict, updated catalog, and updated AcroForm.

    # Build the appended chunk with placeholders we can patch in place.
    update_offsets = {}
    update_chunks = []

    # Object 9: second Sig field annot.
    update_chunks.append(b"\n9 0 obj\n")
    update_offsets[9] = len(inner_pdf) + sum(len(c) for c in update_chunks) - len(b"\n9 0 obj\n")
    update_chunks.append(
        b"<< /Type /Annot /Subtype /Widget /FT /Sig /T (Signature2) "
        b"/V 10 0 R /Rect [0 0 0 0] /F 4 /P 3 0 R >>\nendobj\n"
    )

    # Object 10: second Sig dict (placeholders).
    sig_prefix = (
        b"<< /Type /Sig "
        b"/Filter /Adobe.PPKLite "
        b"/SubFilter /adbe.pkcs7.detached "
        b"/M (D:20260509000001Z) "
        b"/Reason (Outer signature for sub-signature test) "
        b"/ByteRange [0000000000 0000000000 0000000000 0000000000] "
        b"/Contents <"
    )
    sig_zeros = b"0" * (PLACEHOLDER_PKCS7_LEN * 2)
    update_chunks.append(b"10 0 obj\n")
    update_offsets[10] = len(inner_pdf) + sum(len(c) for c in update_chunks) - len(b"10 0 obj\n")
    update_chunks.append(sig_prefix)
    contents_open_2 = len(inner_pdf) + sum(len(c) for c in update_chunks) - 1  # '<'
    update_chunks.append(sig_zeros)
    update_chunks.append(b">")
    update_chunks.append(b" >>\nendobj\n")

    # Object 1 (catalog) updated to point at a new AcroForm with both
    # fields. We rewrite the same number; the xref will mark it as
    # generation 0 again with a new offset.
    update_chunks.append(b"1 0 obj\n")
    update_offsets[1] = len(inner_pdf) + sum(len(c) for c in update_chunks) - len(b"1 0 obj\n")
    update_chunks.append(
        b"<< /Type /Catalog /Pages 2 0 R "
        b"/AcroForm << /Fields [4 0 R 9 0 R] /SigFlags 3 >> >>\nendobj\n"
    )

    appended = b"".join(update_chunks)
    pdf = bytearray(inner_pdf + appended)

    # Compute final positions of the new placeholder.
    hex_start_2 = contents_open_2 + 1
    hex_end_2 = hex_start_2 + PLACEHOLDER_PKCS7_LEN * 2
    assert pdf[contents_open_2:contents_open_2 + 1] == b"<"
    assert pdf[hex_end_2:hex_end_2 + 1] == b">"

    # Build incremental xref table.
    # Pre-xref offset for startxref.
    pre_xref = bytearray(pdf)

    # Patch ByteRange of outer Sig: covers everything except the hex
    # blob inside the second /Contents.
    outer_a = 0
    outer_b = contents_open_2 + 1
    outer_c = hex_end_2

    # We don't know `d` until we know where the xref/trailer is, which
    # depends on `d` itself if the offset/`d` lengths change... but
    # ByteRange numbers are fixed-width 010d so they don't change size.
    # So we can compute `d` once we know where the file ends.

    # We'll construct the rest assuming `d` is the bytes from hex_end_2
    # to EOF. Build the xref + trailer relative to current position.
    xref_offset = len(pre_xref)
    xref = (
        b"xref\n"
        + b"1 1\n" + f"{update_offsets[1]:010d} 00000 n \n".encode("ascii")
        + b"9 2\n"
        + f"{update_offsets[9]:010d} 00000 n \n".encode("ascii")
        + f"{update_offsets[10]:010d} 00000 n \n".encode("ascii")
    )
    trailer = (
        b"trailer\n"
        + b"<< /Size 11 /Root 1 0 R /Prev "
        + str(_find_startxref(inner_pdf)).encode("ascii")
        + b" >>\nstartxref\n"
        + str(xref_offset).encode("ascii")
        + b"\n%%EOF\n"
    )

    pdf = bytearray(pre_xref + xref + trailer)
    outer_d = len(pdf) - outer_c
    _patch_byte_range_from(
        pdf, outer_a, outer_b, outer_c, outer_d,
        # The placeholder belongs to obj 10 only.
        from_offset=update_offsets[10],
    )

    digest_outer = hashlib.sha256(
        bytes(pdf[outer_a:outer_a + outer_b]) + bytes(pdf[outer_c:outer_c + outer_d])
    ).hexdigest()
    pkcs7_outer = run_pycms(outer_spec_template.format(sha256=digest_outer))
    _splice_pkcs7(pdf, hex_start_2, hex_end_2, pkcs7_outer)

    return pdf


def _find_startxref(pdf_bytes):
    idx = pdf_bytes.rindex(b"startxref")
    after = pdf_bytes[idx + len(b"startxref"):]
    m = re.search(rb"\d+", after)
    return int(m.group(0))


def _patch_byte_range_from(pdf, a, b, c, d, *, from_offset):
    placeholder = b"/ByteRange [0000000000 0000000000 0000000000 0000000000]"
    replacement = (
        f"/ByteRange [{a:010d} {b:010d} {c:010d} {d:010d}]".encode("ascii")
    )
    assert len(replacement) == len(placeholder)
    idx = pdf.index(placeholder, from_offset)
    pdf[idx:idx + len(placeholder)] = replacement


SPEC_VERIFIED = """\
sha256:{sha256}
signer:
issuer:pdf-sign-ca
subject:test-pdf-signer
"""
SPEC_EXPIRED = """\
sha256:{sha256}
signer:
issuer:pdf-sign-ca-expired
subject:test-pdf-signer-expired
"""
SPEC_UNTRUSTED = """\
sha256:{sha256}
signer:
issuer:Untrusted Self-Signed Test Root
subject:Untrusted Self-Signed Test Root
"""


MULTI_CASES = [
    (
        "signed_multi_verified",
        PAGE_HEADER + """\
Expected verification state: VERIFIED (multi-signature)

Outer signature: leaf <- pdf-sign-ca -> verified.
Inner signature: leaf <- pdf-sign-ca -> verified.

Toolbar icon: GREEN check. Banner: GREEN, "Document signed and
verified" (count = 2). Outer card has GREEN status check + GREEN
"Certificate: Trusted (pdf-sign-ca)" (everything is fine, top-
level). The expanded inner card uses the muted GREY check on
both rows -- green is reserved for the top-level card.
""",
        # inner_spec, outer_spec
        SPEC_VERIFIED, SPEC_VERIFIED,
    ),
    (
        "signed_multi_mixed",
        PAGE_HEADER + """\
Expected verification state: UNTRUSTED (multi-signature)

Outer signature: leaf <- pdf-sign-ca -> verified.
Inner signature: self-signed -> untrusted.

Toolbar icon: ORANGE exclamation. Banner: ORANGE, "Document signed
with a certificate that is not trusted" (count = 1, the inner sig).
Outer card shows GREY check, "Certificate: Trusted (pdf-sign-ca)"
(green is suppressed because the inner sig is untrusted). Expanded
inner card shows orange "Unknown issuer (Untrusted Self-Signed
Test Root)".
""",
        # inner = untrusted, outer = verified
        SPEC_UNTRUSTED, SPEC_VERIFIED,
    ),
    (
        "signed_multi_outer_verified_inner_expired",
        PAGE_HEADER + """\
Expected verification state: EXPIRED (multi-signature)

Outer signature: leaf <- pdf-sign-ca -> verified.
Inner signature: leaf <- pdf-sign-ca-expired -> expired.

This case is the most informative test of the worst-status banner
aggregation: the top-level signature is fully valid, but the worst
status across the whole tree is "expired", so the banner must show
the orange "...with an expired certificate" message and the toolbar
button must use the orange warn icon.

Outer card: status grey check, certificate GREY "Trusted
            (pdf-sign-ca)" (green suppressed because the inner sig
            is expired).
Inner card: status grey check (signature itself is verified),
            certificate orange "Expired (Dec 31, 2020)".
""",
        # inner = expired, outer = verified
        SPEC_EXPIRED, SPEC_VERIFIED,
    ),
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--out",
        type=Path,
        default=CORPUS_DIR,
        help="Output directory (default: this script's directory).",
    )
    parser.add_argument(
        "--mozilla-central",
        type=Path,
        default=None,
        help=(
            "Path to a built mozilla-central checkout. Defaults to the "
            "MOZILLA_CENTRAL_SRC env var, then /opt/mozilla/firefox."
        ),
    )
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    global FIREFOX_DIR, TOOLS_DIR, PYCMS
    FIREFOX_DIR = _resolve_mozilla_central_dir(args.mozilla_central)
    TOOLS_DIR = FIREFOX_DIR / "security/manager/tools"
    PYCMS = TOOLS_DIR / "pycms.py"

    if not PYCMS.exists():
        raise SystemExit(
            f"pycms.py not found at {PYCMS}\n"
            f"Pass --mozilla-central </path/to/mozilla-central> or set the "
            f"MOZILLA_CENTRAL_SRC environment variable."
        )

    for case in CASES:
        pdf = _build_single(case)
        path = args.out / f"{case['name']}.pdf"
        path.write_bytes(bytes(pdf))
        print(f"  wrote {path.name} ({len(pdf)} bytes)")

    for name, page_text, inner_spec, outer_spec in MULTI_CASES:
        # NB: Inner signature template has a unique tag so the post-process
        # tampering of "signed_invalid" can target it; multi cases don't
        # need post_process.
        pdf = _build_multi(name, page_text, inner_spec, outer_spec)
        path = args.out / f"{name}.pdf"
        path.write_bytes(bytes(pdf))
        print(f"  wrote {path.name} ({len(pdf)} bytes)")


if __name__ == "__main__":
    main()
