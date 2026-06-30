# Digital signature properties — manual-test PDF corpus

This directory ships a Python generator that produces a small corpus
of digitally signed PDFs covering every visible state of the
**Digital signature properties** doorhanger. The intent is manual visual
testing: open each PDF in a Firefox build that has the signature
verification UI enabled, and compare what the toolbar / banner /
cards render against what the PDF's own page content says they
should render.

The PDFs themselves are **not committed** (`*.pdf` is ignored). Only
`generate.py` and this README are tracked, so you regenerate the
corpus when you need it.

## Prerequisites

1. A built mozilla-central checkout. The generator shells out to its
   `security/manager/tools/pycms.py` and reuses its vendored Python
   modules under
   `third_party/python/{ecdsa,rsa,pyasn1,pyasn1_modules,six}`.
2. A Firefox build (Nightly or a local artefact / full build) that
   includes the pdf.js viewer + chrome bridge for the Signature
   Properties UI. Any Nightly built after the Bug 1943059 landing
   contains both pieces.

The generator finds your mozilla-central checkout in this order:

1. `--mozilla-central </path/to/mozilla-central>` CLI flag.
2. `MOZILLA_CENTRAL_SRC` environment variable.
3. `/opt/mozilla/firefox` (fallback default; prints a warning).

## Generate

From the pdf.js root, with the path resolved via any of the methods
above:

```sh
python3 test/pdfs/sig_corpus/generate.py \
    --mozilla-central ~/src/mozilla-central
# …or…
MOZILLA_CENTRAL_SRC=~/src/mozilla-central \
    python3 test/pdfs/sig_corpus/generate.py
```

You should see eight `.pdf` files appear in this directory.

## Enable the test trust anchors pref

Three of the cases (`signed_verified`, both verified multi-sig PDFs,
and the outer half of `signed_multi_outer_verified_inner_expired`)
need Firefox to trust the bundled `pdf-sign-ca` test root. That root
is gated behind one pref:

```
security.pdf_signature_verification.enable_test_trust_anchors = true
```

The pref defaults to `false` in every Firefox build (Release, Beta,
Nightly, local), so by default a Firefox cannot validate PDFs
signed with these test certs. To enable it for manual testing:

- Easiest: append the contents of `user.js.example` (next to this
  README) to your dev profile's `user.js` and (re)launch Firefox.
- Or via `about:config` → search for the pref name → toggle to
  `true`.

⚠️ **Do not enable this in your normal browsing profile.** With the
pref on, any PDF signed with the publicly known mozilla-central test
private key validates as "trusted" until those certs expire
(`pdf-sign-ca` notAfter = 2027-01-01).

## Open the PDFs

Launch any Firefox build that bundles the Digital signature properties UI
and open the PDFs via `file:///` URLs, e.g.:

```sh
firefox file:///$(pwd)/test/pdfs/sig_corpus/signed_verified.pdf
```

Or `./mach run -- file:///…/signed_verified.pdf` from your
mozilla-central checkout.

The page content of every PDF describes the expected toolbar icon,
banner, status row, and certificate row. Compare it against the
doorhanger.

## Cases

| File | Toolbar icon | Banner | Notes |
|---|---|---|---|
| `signed_verified.pdf` | green ✓ | green | leaf ← `pdf-sign-ca` |
| `signed_untrusted.pdf` | orange ! | orange | self-signed root |
| `signed_expired.pdf` | orange ! | orange | leaf ← `pdf-sign-ca-expired` |
| `signed_invalid.pdf` | red × | red | one byte tampered post-sign |
| `signed_unknown.pdf` | red × | red | `/SubFilter /ETSI.CAdES.detached` (unsupported by pdf.js) |
| `signed_multi_verified.pdf` | green ✓ | green | both sigs valid, "Sub-signatures (1)" |
| `signed_multi_mixed.pdf` | orange ! | orange | outer verified, inner self-signed/untrusted |
| `signed_multi_outer_verified_inner_expired.pdf` | orange ! | orange | outer verified, inner expired — exercises worst-status-wins logic |

The last entry is the most informative for verifying that the
banner aggregation isn't accidentally clamped to the outermost
signature.

## Out of scope

- **`revoked` status.** Producing a revoked-certificate state
  end-to-end against NSS requires either an OCSP responder, a CRL
  file in the right path, or a OneCRL fixture — none of which are
  feasible to ship as a static PDF corpus. The UI path for
  `revoked` (red banner / red cert row / red toolbar icon) is
  exercised only via the existing xpcshell tests.
- **CAdES validation.** `signed_unknown.pdf` only proves that pdf.js
  short-circuits to `unknown` for `ETSI.CAdES.detached`; real CAdES
  signature validation is follow-up Firefox work.

## Sanity check the safeguard

Open `signed_verified.pdf` with the pref **off** (default). Every
single PDF should now report `untrusted (unknown issuer)`. That's
the expected behavior in shipping Firefox and confirms the pref
guard is doing its job.
