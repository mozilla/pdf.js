# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Iepriekšējā lapa
pdfjs-previous-button-label = Iepriekšējā
pdfjs-next-button =
    .title = Nākamā lapa
pdfjs-next-button-label = Nākamā
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Lapa
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = no { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } no { $pagesCount })
pdfjs-zoom-out-button =
    .title = Attālināt
pdfjs-zoom-out-button-label = Attālināt
pdfjs-zoom-in-button =
    .title = Pietuvināt
pdfjs-zoom-in-button-label = Pietuvināt
pdfjs-zoom-select =
    .title = Palielinājums
pdfjs-presentation-mode-button =
    .title = Pārslēgties uz Prezentācijas režīmu
pdfjs-presentation-mode-button-label = Prezentācijas režīms
pdfjs-open-file-button =
    .title = Atvērt datni
pdfjs-open-file-button-label = Atvērt
pdfjs-print-button =
    .title = Drukāšana
pdfjs-print-button-label = Drukāt
pdfjs-save-button =
    .title = Saglabāt
pdfjs-save-button-label = Saglabāt
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Lejupielādēt
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Lejupielādēt
pdfjs-bookmark-button =
    .title = Pašreizējā lapa (Skatīt URL no pašreizējās lapas)
pdfjs-bookmark-button-label = Pašreizējā lapa

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Rīki
pdfjs-tools-button-label = Rīki
pdfjs-first-page-button =
    .title = Iet uz pirmo lapu
pdfjs-first-page-button-label = Iet uz pirmo lapu
pdfjs-last-page-button =
    .title = Iet uz pēdējo lapu
pdfjs-last-page-button-label = Iet uz pēdējo lapu
pdfjs-page-rotate-cw-button =
    .title = Pagriezt pa pulksteni
pdfjs-page-rotate-cw-button-label = Pagriezt pa pulksteni
pdfjs-page-rotate-ccw-button =
    .title = Pagriezt pret pulksteni
pdfjs-page-rotate-ccw-button-label = Pagriezt pret pulksteni
pdfjs-cursor-text-select-tool-button =
    .title = Aktivizēt teksta izvēles rīku
pdfjs-cursor-text-select-tool-button-label = Teksta izvēles rīks
pdfjs-cursor-hand-tool-button =
    .title = Aktivēt rokas rīku
pdfjs-cursor-hand-tool-button-label = Rokas rīks
pdfjs-scroll-page-button =
    .title = Izmantojiet lapas ritināšanu
pdfjs-scroll-page-button-label = Lapas ritināšana
pdfjs-scroll-vertical-button =
    .title = Izmantot statenisko ritināšanu
pdfjs-scroll-vertical-button-label = Stateniskā ritināšana
pdfjs-scroll-horizontal-button =
    .title = Izmantot līmenisko ritināšanu
pdfjs-scroll-horizontal-button-label = Līmeniskā ritināšana
pdfjs-scroll-wrapped-button =
    .title = Izmantot apkļauto ritināšanu
pdfjs-scroll-wrapped-button-label = Apkļautā ritināšana
pdfjs-spread-none-button =
    .title = Nepievienoties lapu izpletumiem
pdfjs-spread-none-button-label = Neizmantot izpletumus
pdfjs-spread-odd-button =
    .title = Izmantot lapu izpletumus sākot ar nepāra numuru lapām
pdfjs-spread-odd-button-label = Nepāra izpletumi
pdfjs-spread-even-button =
    .title = Izmantot lapu izpletumus sākot ar pāra numuru lapām
pdfjs-spread-even-button-label = Pāra izpletumi

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumenta iestatījumi…
pdfjs-document-properties-button-label = Dokumenta iestatījumi…
pdfjs-document-properties-file-name = Datnes nosaukums:
pdfjs-document-properties-file-size = Faila izmērs:
# Variables:
#   $kb (Number) - the PDF file size in kilobytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-kb = { NUMBER($kb, maximumSignificantDigits: 3) } KB ({ $b } baiti)
# Variables:
#   $mb (Number) - the PDF file size in megabytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-mb = { NUMBER($mb, maximumSignificantDigits: 3) }, MB ({ $b } baiti)
pdfjs-document-properties-title = Nosaukums:
pdfjs-document-properties-author = Autors:
pdfjs-document-properties-subject = Tēma:
pdfjs-document-properties-keywords = Atslēgas vārdi:
pdfjs-document-properties-creation-date = Izveides datums:
pdfjs-document-properties-modification-date = LAbošanas datums:
# Variables:
#   $dateObj (Date) - the creation/modification date and time of the PDF file
pdfjs-document-properties-date-time-string = { DATETIME($dateObj, dateStyle: "short", timeStyle: "medium") }
pdfjs-document-properties-creator = Radītājs:
pdfjs-document-properties-producer = PDF producents:
pdfjs-document-properties-version = PDF versija:
pdfjs-document-properties-page-count = Lapu skaits:
pdfjs-document-properties-page-size = Papīra izmērs:
pdfjs-document-properties-page-size-unit-inches = collas
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = portretorientācija
pdfjs-document-properties-page-size-orientation-landscape = ainavorientācija
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Vēstule
pdfjs-document-properties-page-size-name-legal = Juridiskie teksti

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit } ({ $name }, { $orientation })

##

# The linearization status of the document; usually called "Fast Web View" in
# English locales of Adobe software.
pdfjs-document-properties-linearized = Ātrā tīmekļa skats:
pdfjs-document-properties-linearized-yes = Jā
pdfjs-document-properties-linearized-no = Nē
pdfjs-document-properties-close-button = Aizvērt
pdfjs-digital-signature-properties-view-certificate = Apskatīt sertifikātu
# Shown beneath an invalid signature card to explain why verification
# failed. The text comes from NSS (e.g. "Signature integrity has been
# compromised", "PKCS#7 signature could not be parsed") and is not
# itself localized — it is the underlying error message produced by
# the verification backend.
# Variables:
#   $reason (String) - error message describing why the signature
#                      could not be verified.
pdfjs-digital-signature-properties-reason = Iemesls: { $reason }
# Variables:
#   $dateObj (Date) - the signing time from the /Sig dict's /M entry.
pdfjs-digital-signature-properties-timestamp = Laika zīmogs: { DATETIME($dateObj, dateStyle: "short", timeStyle: "medium") }
# Variables:
#   $count (Number) - number of nested sub-signatures (one per earlier
#                     incremental revision of the document).
pdfjs-digital-signature-properties-sub-signatures =
    { $count ->
        [one] Apakšparaksts ({ $count })
        [zero] Apakšparaksti ({ $count })
       *[other] Apakšparaksti ({ $count })
    }

## Print

pdfjs-print-progress-message = Gatavo dokumentu drukāšanai...
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Atcelt
pdfjs-printing-not-supported = Uzmanību: Drukāšana no šī pārlūka darbojas tikai daļēji.
pdfjs-printing-not-ready = Uzmanību: PDF nav pilnībā ielādēts drukāšanai.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-current-outline-item-button =
    .title = Atrast pašreizējo satura rādītāja vienumu
pdfjs-current-outline-item-button-label = Pašreizējais satura rādītāja vienums
pdfjs-findbar-button =
    .title = Meklēt dokumentā
pdfjs-findbar-button-label = Meklēt
pdfjs-additional-layers = Papildu slāņi

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Lapas { $page } sīktēls
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-checkbox1 =
    .title = Atlasiet lapu { $page }
# Variables:
#   $page (Number) - the page number
#   $total (Number) - the number of pages
pdfjs-thumb-page-title1 =
    .title = { $page }. lpp. no { $total }

## Find panel button title and messages

pdfjs-find-input =
    .placeholder = Meklēt dokumentā…
    .title = Meklēt
pdfjs-find-previous-button =
    .title = Atrast iepriekšējo
pdfjs-find-previous-button-label = Iepriekšējā
pdfjs-find-next-button =
    .title = Atrast nākamo
pdfjs-find-next-button-label = Nākamā
pdfjs-find-highlight-checkbox = Izcelt visus
pdfjs-find-match-case-checkbox-label = Lielo un mazo burtu atbilstība
pdfjs-find-match-diacritics-checkbox-label = Diakritisko zīmju atbilstība
pdfjs-find-entire-word-checkbox-label = Veselus vārdus
pdfjs-find-reached-top = Sasniegts dokumenta sākums, turpinām no beigām
pdfjs-find-reached-bottom = Sasniegtas dokumenta beigas, turpinām no sākuma
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } no { $total } atbilstība
        [zero] { $current } no { $total } atbilstībām
       *[other] { $current } no { $total } atbilstībām
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Vairāk nekā { $limit } atbilstība
        [zero] Vairāk kā { $limit } atbilstības
       *[other] Vairāk kā { $limit } atbilstības
    }
pdfjs-find-not-found = Vārdkopa nav atrasta

## Predefined zoom values

pdfjs-page-scale-width = Lapas platumā
pdfjs-page-scale-fit = Ietilpinot lapu
pdfjs-page-scale-auto = Automātiskais izmērs
pdfjs-page-scale-actual = Patiesais izmērs
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = { $page } lapa

## Loading indicator messages

pdfjs-loading-error = Ielādējot PDF notika kļūda.
pdfjs-invalid-file-error = Nederīga vai bojāt PDF datne.
pdfjs-missing-file-error = PDF datne nav atrasta.
pdfjs-unexpected-response-error = Negaidīa servera atbilde.
pdfjs-rendering-error = Attēlojot lapu radās kļūda

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } anotācija]
# Variables:
#   $dateObj (Date) - the modification date and time of the annotation
pdfjs-annotation-date-time-string = { DATETIME($dateObj, dateStyle: "short", timeStyle: "medium") }

## Password

pdfjs-password-label = Jāievada parole, lai atvērtu šo PDF datni.
pdfjs-password-invalid = Nepareiza parole, mēģiniet vēlreiz.
pdfjs-password-ok-button = Labi
pdfjs-password-cancel-button = Atcelt
pdfjs-web-fonts-disabled = Tīmekļa fonti nav aktivizēti: Nevar iegult PDF fontus.

## Editing

pdfjs-editor-free-text-button =
    .title = Teksts
pdfjs-editor-color-picker-free-text-input =
    .title = Mainīt teksta krāsu
pdfjs-editor-free-text-button-label = Teksts
pdfjs-editor-ink-button =
    .title = Zīmēt
pdfjs-editor-color-picker-ink-input =
    .title = Mainīt zīmējuma krāsu
pdfjs-editor-ink-button-label = Zīmēt
pdfjs-editor-stamp-button =
    .title = Pievienot vai labot attēlus
pdfjs-editor-stamp-button-label = Pievienot vai labot attēlus
pdfjs-editor-highlight-button =
    .title = Izcelt
pdfjs-editor-highlight-button-label = Izcelt
pdfjs-highlight-floating-button1 =
    .aria-label = Izcelt
    .title = Izcelt
pdfjs-highlight-floating-button-label = Izcelt
pdfjs-comment-floating-button =
    .aria-label = Komentēt
    .title = Komentēt
pdfjs-comment-floating-button-label = Komentārs
pdfjs-editor-comment-button =
    .aria-label = Komentēt
    .title = Komentēt
pdfjs-editor-comment-button-label = Komentārs
pdfjs-editor-signature-button =
    .title = Pievienot parakstu
pdfjs-editor-signature-button-label = Pievienot parakstu

## Default editor aria labels

# “Highlight” is a noun, the string is used on the editor for highlights.
pdfjs-editor-highlight-editor =
    .aria-label = Izcelt redaktoru
# “Drawing” is a noun, the string is used on the editor for drawings.
pdfjs-editor-ink-editor =
    .aria-label = Zīmēšanas redaktors
# Used when a signature editor is selected/hovered.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-signature-editor2 =
    .aria-description = Paraksta labotājs: { $description }
    .aria-label = Paraksta labotājs
# Used when a signature editor is selected/hovered.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-signature-editor1 =
    .aria-description = Paraksta redaktors: { $description }
pdfjs-editor-stamp-editor =
    .aria-label = Attēlu labotājs

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Noņemt zīmējumu
pdfjs-editor-remove-freetext-button =
    .title = Noņemt tekstu
pdfjs-editor-remove-stamp-button =
    .title = Noņemt attēlu
pdfjs-editor-remove-highlight-button =
    .title = Noņemt iezīmējumu
pdfjs-editor-remove-signature-button =
    .title = Noņemt parakstu

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Krāsa
pdfjs-editor-free-text-size-input = Izmērs
pdfjs-editor-ink-color-input = Krāsa
pdfjs-editor-ink-thickness-input = Biezums
pdfjs-editor-ink-opacity-input = Necaurspīdība
pdfjs-editor-stamp-add-image-button =
    .title = Pievienot attēlu
pdfjs-editor-stamp-add-image-button-label = Pievienot attēlu
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Biezums
pdfjs-editor-free-highlight-thickness-title =
    .title = Mainīt biezumu, iezīmējot citus elementus, nevis tekstu
pdfjs-editor-add-signature-container =
    .aria-label = Paraksta vadīklas un saglabātie paraksti
pdfjs-editor-signature-add-signature-button =
    .title = Pievienot jaunu parakstu
pdfjs-editor-signature-add-signature-button-label = Pievienot jaunu parakstu
# Used on the button to use an already saved signature.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-add-saved-signature-button =
    .title = Saglabātais paraksts: { $description }
# .default-content is used as a placeholder in an empty text editor.
pdfjs-free-text2 =
    .aria-label = Teksta redaktors
    .default-content = Sāciet rakstīt…
# Used to show how many comments are present in the pdf file.
# Variables:
#   $count (Number) - the number of comments.
pdfjs-editor-comments-sidebar-title =
    { $count ->
        [one] Komentēt
        [zero] Komentāriem
       *[other] Komentāriem
    }
pdfjs-editor-comments-sidebar-close-button =
    .aria-label = Aizvērt sānu joslu
    .title = Aizvērt sānu joslu
pdfjs-editor-comments-sidebar-close-button-label = Aizvērt sānu joslu
# Instructional copy to add a comment by selecting text or an annotations.
pdfjs-editor-comments-sidebar-no-comments1 = Redzat kaut ko ievērības cienīgu? Iezīmējiet to un atstājiet komentāru.
pdfjs-editor-comments-sidebar-no-comments-link = Uzziniet vairāk

## Alt-text dialog

pdfjs-editor-alt-text-button-label = Alt teksts
pdfjs-editor-alt-text-edit-button =
    .aria-label = Labot alt tekstu
pdfjs-editor-alt-text-dialog-label = Izvēlieties opciju
pdfjs-editor-alt-text-dialog-description = Alt teksts (alternatīvs teksts) palīdz, ja cilvēki neredz attēlu vai tas neielādējas.
pdfjs-editor-alt-text-add-description-label = Pievienot aprakstu
pdfjs-editor-alt-text-add-description-description = Izteikums 1–2 teikumos, kas apraksta tēmu, vidi vai darbības.
pdfjs-editor-alt-text-mark-decorative-label = Atzīmēt kā dekoratīvu
pdfjs-editor-alt-text-mark-decorative-description = To izmanto dekoratīviem attēliem, piemēram, apmalēm vai ūdenszīmēm.
pdfjs-editor-alt-text-cancel-button = Atcelt
pdfjs-editor-alt-text-save-button = Saglabāt
pdfjs-editor-alt-text-decorative-tooltip = Atzīmēts kā dekoratīvs
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Piemēram, "Jauns vīrietis apsēžas pie galda, lai ieturētu maltīti".
# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button =
    .aria-label = Alt teksts

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-top-left =
    .aria-label = Augšējais kreisais stūris — mainīt izmēru
pdfjs-editor-resizer-top-middle =
    .aria-label = Augšpusē pa vidu — mainīt izmēru
pdfjs-editor-resizer-top-right =
    .aria-label = Augšējais labais stūris — mainīt izmēru
pdfjs-editor-resizer-middle-right =
    .aria-label = Vidējais labais — mainīt izmēru
pdfjs-editor-resizer-bottom-right =
    .aria-label = Apakšējais labais stūris — mainīt izmēru
pdfjs-editor-resizer-bottom-middle =
    .aria-label = Apakšā pa vidu — mainīt izmēru
pdfjs-editor-resizer-bottom-left =
    .aria-label = Apakšējais kreisais stūris — mainīt izmēru
pdfjs-editor-resizer-middle-left =
    .aria-label = Vidējais kreisais — mainīt izmēru

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Izcelt krāsu
pdfjs-editor-colorpicker-button =
    .title = Mainīt krāsu
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Krāsu izvēles
pdfjs-editor-colorpicker-yellow =
    .title = Dzeltens
pdfjs-editor-colorpicker-green =
    .title = Zaļš
pdfjs-editor-colorpicker-blue =
    .title = Zils
pdfjs-editor-colorpicker-pink =
    .title = Rozā
pdfjs-editor-colorpicker-red =
    .title = Sarkans

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Rādīt visu
pdfjs-editor-highlight-show-all-button =
    .title = Rādīt visu

## New alt-text dialog
## Group note for entire feature: Alternative text (alt text) helps when people can't see the image. This feature includes a tool to create alt text automatically using an AI model that works locally on the user's device to preserve privacy.

# Modal header positioned above a text box where users can edit the alt text.
pdfjs-editor-new-alt-text-dialog-edit-label = Labot alt tekstu (attēla aprakstu)
# Modal header positioned above a text box where users can add the alt text.
pdfjs-editor-new-alt-text-dialog-add-label = Pievienot alt tekstu (attēla aprakstu)
pdfjs-editor-new-alt-text-textarea =
    .placeholder = Rakstiet savu aprakstu šeit…
# This text refers to the alt text box above this description. It offers a definition of alt text.
pdfjs-editor-new-alt-text-description = Īss apraksts cilvēkiem, kuri neredz attēlu vai ja attēls neielādējas.
# This is a required legal disclaimer that refers to the automatically created text inside the alt text box above this text. It disappears if the text is edited by a human.
pdfjs-editor-new-alt-text-disclaimer1 = Šis alternatīvais teksts tika izveidots automātiski un var būt neprecīzs.
pdfjs-editor-new-alt-text-disclaimer-learn-more-url = Uzzināt vairāk
pdfjs-editor-new-alt-text-create-automatically-button-label = Automātiski izveidot alt tekstu
pdfjs-editor-new-alt-text-not-now-button = Ne tagad
pdfjs-editor-new-alt-text-error-title = Nevarēja automātiski izveidot alternatīvo tekstu.
pdfjs-editor-new-alt-text-error-description = Lūdzu, uzrakstiet savu alt tekstu vai mēģiniet vēlreiz vēlāk.
pdfjs-editor-new-alt-text-error-close-button = Aizvērt
# Variables:
#   $totalSize (Number) - the total size (in MB) of the AI model.
#   $downloadedSize (Number) - the downloaded size (in MB) of the AI model.
pdfjs-editor-new-alt-text-ai-model-downloading-progress = Lejupielādē alt teksta MI modeli ({ $downloadedSize } no { $totalSize } MB)
    .aria-valuetext = Lejupielādē alt teksta MI modeli ({ $downloadedSize } no { $totalSize } MB)
# This is a button that users can click to edit the alt text they have already added.
pdfjs-editor-new-alt-text-added-button =
    .aria-label = Alt teksts ir pievienots
pdfjs-editor-new-alt-text-added-button-label = Alt teksts ir pievienots
# This is a button that users can click to open the alt text editor and add alt text when it is not present.
pdfjs-editor-new-alt-text-missing-button =
    .aria-label = Trūkstošs alt teksts
pdfjs-editor-new-alt-text-missing-button-label = Trūkstošs alt teksts
# This is a button that opens up the alt text modal where users should review the alt text that was automatically generated.
pdfjs-editor-new-alt-text-to-review-button =
    .aria-label = Atsauksmes alternatīvais teksts
pdfjs-editor-new-alt-text-to-review-button-label = Atsauksmes alternatīvais teksts
# "Created automatically" is a prefix that will be added to the beginning of any alt text that has been automatically generated. After the colon, the user will see/hear the actual alt text description. If the alt text has been edited by a human, this prefix will not appear.
# Variables:
#   $generatedAltText (String) - the generated alt-text.
pdfjs-editor-new-alt-text-generated-alt-text-with-disclaimer = Izveidots automātiski: { $generatedAltText }

## Image alt-text settings

pdfjs-image-alt-text-settings-button =
    .title = Attēla alt teksta iestatījumi
pdfjs-image-alt-text-settings-button-label = Attēla alt teksta iestatījumi
pdfjs-editor-alt-text-settings-dialog-label = Attēla alt teksta iestatījumi
pdfjs-editor-alt-text-settings-automatic-title = Automātisks alt teksts
pdfjs-editor-alt-text-settings-create-model-button-label = Automātiski izveidot alt tekstu
pdfjs-editor-alt-text-settings-create-model-description = Iesaka aprakstus, lai palīdzētu cilvēkiem, kuri neredz attēlu vai kad attēls neielādējas.
pdfjs-editor-alt-text-settings-editor-title = Alt teksta labotājs
pdfjs-editor-alt-text-settings-show-dialog-button-label = Pievienojot attēlu, uzreiz parādīt alt teksta labotāju
pdfjs-editor-alt-text-settings-show-dialog-description = Palīdz pārliecināties, ka visiem attēliem ir alt teksts.
pdfjs-editor-alt-text-settings-close-button = Aizvērt

## Accessibility labels (announced by screen readers) for objects added to the editor.

pdfjs-editor-highlight-added-alert = Izcelts teksts pievienots
pdfjs-editor-freetext-added-alert = Teksts pievienots
pdfjs-editor-ink-added-alert = Zīmējums pievienots
pdfjs-editor-stamp-added-alert = Attēls pievienots
pdfjs-editor-signature-added-alert = Paraksts pievienots

## "Annotations removed" bar

pdfjs-editor-undo-bar-message-highlight = Izcelts teksts noņemts
pdfjs-editor-undo-bar-message-freetext = Teksts noņemts
pdfjs-editor-undo-bar-message-ink = Zīmējums noņemts
pdfjs-editor-undo-bar-message-stamp = Attēls ir noņemts
pdfjs-editor-undo-bar-message-signature = Paraksts noņemts
pdfjs-editor-undo-bar-message-comment = Komentārs ir noņemts
# Variables:
#   $count (Number) - the number of removed annotations.
pdfjs-editor-undo-bar-message-multiple =
    { $count ->
        [one] { $count } anotācija ir noņemta
        [zero] Noņemtas { $count } anotācijas
       *[other] Noņemtas { $count } anotācijas
    }
pdfjs-editor-undo-bar-undo-button =
    .title = Atsaukt
pdfjs-editor-undo-bar-undo-button-label = Atsaukt
pdfjs-editor-undo-bar-close-button =
    .title = Aizvērt
pdfjs-editor-undo-bar-close-button-label = Aizvērt

## Add a signature dialog

pdfjs-editor-add-signature-dialog-label = Šis modālais logs ļauj lietotājam izveidot parakstu, ko pievienot PDF dokumentam. Lietotājs var rediģēt nosaukumu (kas kalpo arī kā alternatīvais teksts) un pēc izvēles saglabāt parakstu atkārtotai lietošanai.
pdfjs-editor-add-signature-dialog-title = Pievienot parakstu

## Tab names

# Type is a verb (you can type your name as signature)
pdfjs-editor-add-signature-type-button = Veids
    .title = Veids
# Draw is a verb (you can draw your signature)
pdfjs-editor-add-signature-draw-button = Zīmēt
    .title = Zīmēt
pdfjs-editor-add-signature-image-button = Attēls
    .title = Attēls

## Tab panels

pdfjs-editor-add-signature-type-input =
    .aria-label = Ierakstiet savu parakstu
    .placeholder = Ierakstiet savu parakstu
pdfjs-editor-add-signature-draw-placeholder = Uzzīmējiet savu parakstu
pdfjs-editor-add-signature-draw-thickness-range-label = Biezums
# Variables:
#   $thickness (Number) - the thickness (in pixels) of the line used to draw a signature.
pdfjs-editor-add-signature-draw-thickness-range =
    .title = Zīmējuma biezums: { $thickness }
pdfjs-editor-add-signature-image-placeholder = Vilkt datni šeit, lai augšupielādētu
pdfjs-editor-add-signature-image-browse-link =
    { PLATFORM() ->
        [macos] Vai jāizvēlas attēlu datnes
       *[other] Vai jāpārlūko attēlu datnes
    }

## Controls

pdfjs-editor-add-signature-description-label = Apraksts (alternatīvais teksts)
pdfjs-editor-add-signature-description-input =
    .title = Apraksts (alternatīvais teksts)
pdfjs-editor-add-signature-description-default-when-drawing = Paraksts
pdfjs-editor-add-signature-clear-button-label = Skaidrs paraksts
pdfjs-editor-add-signature-clear-button =
    .title = Skaidrs paraksts
pdfjs-editor-add-signature-save-checkbox = Saglabāt parakstu
pdfjs-editor-add-signature-save-warning-message = Jūs esat sasniedzis saglabāto parakstu ierobežojumu — 5. Noņemiet vienu, lai saglabātu citus.
pdfjs-editor-add-signature-image-upload-error-title = Nevarēja augšupielādēt attēlu
pdfjs-editor-add-signature-image-upload-error-description = Jāpŗabauda savienojums ar internetu vai jāmēģina cits attēls.
pdfjs-editor-add-signature-image-no-data-error-title = Šo attēlu nevar pārveidot par parakstu.
pdfjs-editor-add-signature-image-no-data-error-description = Lūdzu, mēģiniet augšupielādēt citu attēlu.
pdfjs-editor-add-signature-error-close-button = Aizvērt

## Dialog buttons

pdfjs-editor-add-signature-cancel-button = Atcelt
pdfjs-editor-add-signature-add-button = Pievienot
pdfjs-editor-edit-signature-update-button = Atjaunināt

## Comment popup

pdfjs-editor-edit-comment-popup-button-label = Labot komentāru
pdfjs-editor-edit-comment-popup-button =
    .title = Labot komentāru
pdfjs-editor-delete-comment-popup-button-label = Noņemt komentāru
pdfjs-editor-delete-comment-popup-button =
    .title = Noņemt komentāru
pdfjs-show-comment-button =
    .title = Rādīt komentāru

##  Edit a comment dialog

# An existing comment is edited
pdfjs-editor-edit-comment-dialog-title-when-editing = Labot komentāru
pdfjs-editor-edit-comment-dialog-save-button-when-editing = Atjaunināt
# No existing comment
pdfjs-editor-edit-comment-dialog-title-when-adding = Pievienot piebildi
pdfjs-editor-edit-comment-dialog-save-button-when-adding = Pievienot
pdfjs-editor-edit-comment-dialog-text-input =
    .placeholder = Sāciet rakstīt…
pdfjs-editor-edit-comment-dialog-cancel-button = Atcelt

## Edit a comment button in the editor toolbar

pdfjs-editor-add-comment-button =
    .title = Pievienot piebildi

## The view manager is a sidebar displaying different views:
##  - thumbnails;
##  - outline;
##  - attachments;
##  - layers.
## The thumbnails view is used to edit the pdf: remove/insert pages, ...

pdfjs-toggle-views-manager-notification-button =
    .title = Pārslēgt sānu joslu (dokumentā ir sīktēli/saturs/pielikumi/slāņi)
pdfjs-toggle-views-manager-button1-label = Pārvaldīt lapas
pdfjs-views-manager-sidebar =
    .aria-label = Sānu josla
pdfjs-views-manager-sidebar-resizer =
    .aria-label = Sānu joslas izmēru mainītājs
pdfjs-views-manager-view-selector-button =
    .title = Skati
pdfjs-views-manager-view-selector-button-label = Skati
pdfjs-views-manager-pages-title = Lapas
pdfjs-views-manager-outlines-title1 = Dokumenta saturs
    .title = Dokumenta saturs (veiciet dubultklikšķi, lai izvērstu/sakļautu visus vienumus)
pdfjs-views-manager-attachments-title = Pielikumi
pdfjs-views-manager-layers-title1 = Slāņi
    .title = Slāņi (veiciet dubultklikšķi, lai atiestatītu visus slāņus uz noklusējuma stāvokli)
pdfjs-views-manager-pages-option-label = Lapas
pdfjs-views-manager-outlines-option-label = Dokumenta saturs
pdfjs-views-manager-attachments-option-label = Pielikumi
pdfjs-views-manager-layers-option-label = Slāņi
pdfjs-views-manager-add-file-button =
    .title = Pievienot datni
pdfjs-views-manager-add-file-button-label = Pievienot datni
# Variables:
#   $count (Number) - the number of selected pages.
pdfjs-views-manager-pages-status-action-label =
    { $count ->
        [one] Atlasīts { $count }
        [zero] Atlasīti { $count }
       *[other] Atlasīti { $count }
    }
pdfjs-views-manager-pages-status-none-action-label = Atlasīt lapas
pdfjs-views-manager-pages-status-action-button-label = Pārvaldīt
pdfjs-views-manager-pages-status-copy-button-label = Kopēt
pdfjs-views-manager-pages-status-cut-button-label = Izgriezt
pdfjs-views-manager-pages-status-delete-button-label = Dzēst
pdfjs-views-manager-pages-status-export-selected-button-label = Eksportēt atlasītās…
# Variables:
#   $count (Number) - the number of selected pages to be cut.
pdfjs-views-manager-status-undo-cut-label =
    { $count ->
        [one] 1 lapas izgriešana
        [zero] { $count } lappuses izgrieztas
       *[other] { $count } lappuses izgrieztas
    }
# Variables:
#   $count (Number) - the number of selected pages to be copied.
pdfjs-views-manager-pages-status-undo-copy-label =
    { $count ->
        [one] 1 lapa nokopēta
        [zero] Nokopētas { $count } lapas
       *[other] Nokopētas { $count } lapas
    }
# Variables:
#   $count (Number) - the number of selected pages to be deleted.
pdfjs-views-manager-pages-status-undo-delete-label =
    { $count ->
        [one] 1 lapa izdzēsta
        [zero] { $count } lapas izdzēstas
       *[other] { $count } lapas izdzēstas
    }
pdfjs-views-manager-pages-status-waiting-ready-label = Notiek datnes sagatavošana…
pdfjs-views-manager-pages-status-waiting-uploading-label = Notiek datnes augšupielāde…
pdfjs-views-manager-status-warning-cut-label = Nevarēja izgriezt. Atsvaidziniet lapu un mēģiniet vēlreiz.
pdfjs-views-manager-status-warning-copy-label = Nevarēja kopēt. Atsvaidziniet lapu un mēģiniet vēlreiz.
pdfjs-views-manager-status-warning-delete-label = Nevarēja dzēst. Atsvaidziniet lapu un mēģiniet vēlreiz.
pdfjs-views-manager-status-warning-save-label = Nevarēja saglabāt. Atsvaidziniet lapu un mēģiniet vēlreiz.
pdfjs-views-manager-status-undo-button-label = Atsaukt
pdfjs-views-manager-status-done-button-label = Gatavs
pdfjs-views-manager-status-close-button =
    .title = Aizvērt
pdfjs-views-manager-status-close-button-label = Aizvērt
pdfjs-views-manager-paste-button-label = Ielīmēt
pdfjs-views-manager-paste-button-before =
    .title = Ielīmēt pirms pirmās lapas
# Variables:
#   $page (Number) - the page number after which the paste button is.
pdfjs-views-manager-paste-button-after =
    .title = Ielīmēt pēc lapas { $page }
# Badge used to promote a new feature in the UI, keep it as short as possible.
# It's spelled uppercase for English, but it can be translated as usual.
pdfjs-new-badge-content = Jauns
pdfjs-views-manager-waiting-for-file = Notiek datnes augšupielāde…
pdfjs-toggle-views-manager-button1 =
    .title = Pārvaldīt lapas

## Digital signature properties (signature verification panel)

pdfjs-digital-signature-properties-button =
    .aria-label = Digitālā paraksta īpašības
    .title = Digitālā paraksta īpašības
pdfjs-digital-signature-properties-button-label = Digitālā paraksta īpašības

## Banner shown above the signature list summarising the overall
## verification state of the document. Each variant is selected by the
## viewer based on the worst per-signature status; one signature is
## enough to lower the banner.
##
## Variables:
##   $count (Number) - number of signatures at the worst level.

pdfjs-digital-signature-properties-banner-verified = Dokuments tika parakstīts ar derīgu digitālo parakstu
pdfjs-digital-signature-properties-banner-unknown =
    { $count ->
        [one] Dokuments parakstīts, bet digitālo parakstu { $count } nevarēja pārbaudīt
        [zero] Dokuments parakstīts, bet { $count } digitālos parakstus nevarēja pārbaudīt
       *[other] Dokuments parakstīts, bet { $count } digitālos parakstus nevarēja pārbaudīt
    }
pdfjs-digital-signature-properties-banner-untrusted =
    { $count ->
        [one] Dokuments, kas parakstīts ar { $count } neuzticamu sertifikātu
        [zero] Dokuments ir parakstīts ar { $count } neuzticamu sertifikātu
       *[other] Dokuments ir parakstīts ar { $count } neuzticamiem sertifikātiem
    }
pdfjs-digital-signature-properties-banner-expired =
    { $count ->
        [one] Dokuments parakstīts ar { $count } sertifikātu, kura derīguma termiņš ir beidzies
        [zero] Dokuments parakstīts ar { $count } sertifikātu, kura derīguma termiņš ir beidzies
       *[other] Dokuments parakstīts ar { $count } sertifikātiem, kuriem derīguma termiņš ir beidzies
    }
pdfjs-digital-signature-properties-banner-invalid =
    { $count ->
        [one] Dokumentam ir { $count } nederīgs digitālais paraksts
        [zero] Dokumentam ir { $count } nederīgi digitālie paraksti
       *[other] Dokumentam ir { $count } nederīgi digitālie paraksti
    }
pdfjs-digital-signature-properties-banner-revoked =
    { $count ->
        [one] Dokuments parakstīts ar atsauktu sertifikātu { $count }
        [zero] Dokuments parakstīts ar { $count } atsauktiem sertifikātiem
       *[other] Dokuments parakstīts ar { $count } atsauktiem sertifikātiem
    }

## Per-signature status row. Only three distinct strings are needed:
## the signature crypto either verified (the cert chain may still be
## untrusted/expired/revoked, but that's surfaced on the cert row
## below), or it failed, or its sub-format isn't supported.

pdfjs-digital-signature-properties-status-verified = Statuss: Paraksts verificēts
pdfjs-digital-signature-properties-status-invalid = Statuss: Paraksts nederīgs
pdfjs-digital-signature-properties-status-unknown = Statuss: Nevar verificēt (neatbalstīts)

## Per-signature certificate row. The variants with an issuer / date in
## parentheses embed fully-localized context — no English fall-through.
##
## Variables:
##   $issuer (String) - issuer or subject common name from the cert.
##   $dateObj (Date)  - notAfter date for the expired-with-date form.

pdfjs-digital-signature-properties-certificate-trusted = Sertifikāts: Uzticams ({ $issuer })
pdfjs-digital-signature-properties-certificate-unknown = Sertifikāts: Nav pieejams
pdfjs-digital-signature-properties-certificate-untrusted = Sertifikāts: neuzticams
pdfjs-digital-signature-properties-certificate-untrusted-unknown-issuer = Sertifikāts: Nezināms izdevējs ({ $issuer })
pdfjs-digital-signature-properties-certificate-untrusted-self-signed = Sertifikāts: Pašparakstīts ({ $issuer })
pdfjs-digital-signature-properties-certificate-untrusted-untrusted-issuer = Sertifikāts: Neuzticams izdevējs ({ $issuer })
pdfjs-digital-signature-properties-certificate-expired = Sertifikāts: Beidzies derīguma termiņš
pdfjs-digital-signature-properties-certificate-expired-with-date = Sertifikāts: Beidzies derīguma termiņš ({ DATETIME($dateObj, dateStyle: "medium") })
pdfjs-digital-signature-properties-certificate-revoked = Sertifikāts: Atsaukts

## Main menu for adding/removing signatures

pdfjs-editor-delete-signature-button1 =
    .title = Noņemt saglabāto parakstu
pdfjs-editor-delete-signature-button-label1 = Noņemt saglabāto parakstu

## Editor toolbar

pdfjs-editor-add-signature-edit-button-label = Labot aprakstu

## Edit signature description dialog

pdfjs-editor-edit-signature-dialog-title = Labot aprakstu
