# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Předchadna strona
pdfjs-previous-button-label = Wróćo
pdfjs-next-button =
    .title = Přichodna strona
pdfjs-next-button-label = Dale
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Strona
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = z { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } z { $pagesCount })
pdfjs-zoom-out-button =
    .title = Pomjeńšić
pdfjs-zoom-out-button-label = Pomjeńšić
pdfjs-zoom-in-button =
    .title = Powjetšić
pdfjs-zoom-in-button-label = Powjetšić
pdfjs-zoom-select =
    .title = Skalowanje
pdfjs-presentation-mode-button =
    .title = Do prezentaciskeho modusa přeńć
pdfjs-presentation-mode-button-label = Prezentaciski modus
pdfjs-open-file-button =
    .title = Dataju wočinić
pdfjs-open-file-button-label = Wočinić
pdfjs-print-button =
    .title = Ćišćeć
pdfjs-print-button-label = Ćišćeć
pdfjs-save-button =
    .title = Składować
pdfjs-save-button-label = Składować
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Sćahnyć
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Sćahnyć
pdfjs-bookmark-button =
    .title = Aktualna strona (URL z aktualneje strony pokazać)
pdfjs-bookmark-button-label = Aktualna strona

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Nastroje
pdfjs-tools-button-label = Nastroje
pdfjs-first-page-button =
    .title = K prěnjej stronje
pdfjs-first-page-button-label = K prěnjej stronje
pdfjs-last-page-button =
    .title = K poslednjej stronje
pdfjs-last-page-button-label = K poslednjej stronje
pdfjs-page-rotate-cw-button =
    .title = K směrej časnika wjerćeć
pdfjs-page-rotate-cw-button-label = K směrej časnika wjerćeć
pdfjs-page-rotate-ccw-button =
    .title = Přećiwo směrej časnika wjerćeć
pdfjs-page-rotate-ccw-button-label = Přećiwo směrej časnika wjerćeć
pdfjs-cursor-text-select-tool-button =
    .title = Nastroj za wuběranje teksta zmóžnić
pdfjs-cursor-text-select-tool-button-label = Nastroj za wuběranje teksta
pdfjs-cursor-hand-tool-button =
    .title = Ručny nastroj zmóžnić
pdfjs-cursor-hand-tool-button-label = Ručny nastroj
pdfjs-scroll-page-button =
    .title = Kulenje strony wužiwać
pdfjs-scroll-page-button-label = Kulenje strony
pdfjs-scroll-vertical-button =
    .title = Wertikalne suwanje wužiwać
pdfjs-scroll-vertical-button-label = Wertikalne suwanje
pdfjs-scroll-horizontal-button =
    .title = Horicontalne suwanje wužiwać
pdfjs-scroll-horizontal-button-label = Horicontalne suwanje
pdfjs-scroll-wrapped-button =
    .title = Postupne suwanje wužiwać
pdfjs-scroll-wrapped-button-label = Postupne suwanje
pdfjs-spread-none-button =
    .title = Strony njezwjazać
pdfjs-spread-none-button-label = Žana dwójna strona
pdfjs-spread-odd-button =
    .title = Strony započinajo z njerunymi stronami zwjazać
pdfjs-spread-odd-button-label = Njerune strony
pdfjs-spread-even-button =
    .title = Strony započinajo z runymi stronami zwjazać
pdfjs-spread-even-button-label = Rune strony

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumentowe kajkosće…
pdfjs-document-properties-button-label = Dokumentowe kajkosće…
pdfjs-document-properties-file-name = Mjeno dataje:
pdfjs-document-properties-file-size = Wulkosć dataje:
# Variables:
#   $kb (Number) - the PDF file size in kilobytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-kb = { NUMBER($kb, maximumSignificantDigits: 3) } KB ({ $b } bajtow)
# Variables:
#   $mb (Number) - the PDF file size in megabytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-mb = { NUMBER($mb, maximumSignificantDigits: 3) } MB ({ $b } bajtow)
pdfjs-document-properties-title = Titul:
pdfjs-document-properties-author = Awtor:
pdfjs-document-properties-subject = Předmjet:
pdfjs-document-properties-keywords = Klučowe słowa:
pdfjs-document-properties-creation-date = Datum wutworjenja:
pdfjs-document-properties-modification-date = Datum změny:
# Variables:
#   $dateObj (Date) - the creation/modification date and time of the PDF file
pdfjs-document-properties-date-time-string = { DATETIME($dateObj, dateStyle: "short", timeStyle: "medium") }
pdfjs-document-properties-creator = Awtor:
pdfjs-document-properties-producer = PDF-zhotowjer:
pdfjs-document-properties-version = PDF-wersija:
pdfjs-document-properties-page-count = Ličba stronow:
pdfjs-document-properties-page-size = Wulkosć strony:
pdfjs-document-properties-page-size-unit-inches = cól
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = wysoki format
pdfjs-document-properties-page-size-orientation-landscape = prěčny format
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Letter
pdfjs-document-properties-page-size-name-legal = Legal

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
pdfjs-document-properties-linearized = Fast Web View:
pdfjs-document-properties-linearized-yes = Haj
pdfjs-document-properties-linearized-no = Ně
pdfjs-document-properties-close-button = Začinić

## Print

pdfjs-print-progress-message = Dokument so za ćišćenje přihotuje…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Přetorhnyć
pdfjs-printing-not-supported = Warnowanje: Ćišćenje so přez tutón wobhladowak połnje njepodpěruje.
pdfjs-printing-not-ready = Warnowanje: PDF njeje so za ćišćenje dospołnje začitał.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Bóčnicu pokazać/schować
pdfjs-toggle-sidebar-notification-button =
    .title = Bóčnicu přepinać (dokument rozrjad/přiwěški/woršty wobsahuje)
pdfjs-toggle-sidebar-button-label = Bóčnicu pokazać/schować
pdfjs-document-outline-button =
    .title = Dokumentowy naćisk pokazać (dwójne kliknjenje, zo bychu so wšě zapiski pokazali/schowali)
pdfjs-document-outline-button-label = Dokumentowa struktura
pdfjs-attachments-button =
    .title = Přiwěški pokazać
pdfjs-attachments-button-label = Přiwěški
pdfjs-layers-button =
    .title = Woršty pokazać (klikńće dwójce, zo byšće wšě woršty na standardny staw wróćo stajił)
pdfjs-layers-button-label = Woršty
pdfjs-thumbs-button =
    .title = Miniatury pokazać
pdfjs-thumbs-button-label = Miniatury
pdfjs-current-outline-item-button =
    .title = Aktualny rozrjadowy zapisk pytać
pdfjs-current-outline-item-button-label = Aktualny rozrjadowy zapisk
pdfjs-findbar-button =
    .title = W dokumenće pytać
pdfjs-findbar-button-label = Pytać
pdfjs-additional-layers = Dalše woršty

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Strona { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatura strony { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Pytać
    .placeholder = W dokumenće pytać…
pdfjs-find-previous-button =
    .title = Předchadne wustupowanje pytanskeho wuraza pytać
pdfjs-find-previous-button-label = Wróćo
pdfjs-find-next-button =
    .title = Přichodne wustupowanje pytanskeho wuraza pytać
pdfjs-find-next-button-label = Dale
pdfjs-find-highlight-checkbox = Wšě wuzběhnyć
pdfjs-find-match-case-checkbox-label = Wulkopisanje wobkedźbować
pdfjs-find-match-diacritics-checkbox-label = Diakritiske znamješka wužiwać
pdfjs-find-entire-word-checkbox-label = Cyłe słowa
pdfjs-find-reached-top = Spočatk dokumenta docpěty, pokročuje so z kóncom
pdfjs-find-reached-bottom = Kónc dokument docpěty, pokročuje so ze spočatkom
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } z { $total } wotpowědnika
        [two] { $current } z { $total } wotpowědnikow
        [few] { $current } z { $total } wotpowědnikow
       *[other] { $current } z { $total } wotpowědnikow
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Wyše { $limit } wotpowědnik
        [two] Wyše { $limit } wotpowědnikaj
        [few] Wyše { $limit } wotpowědniki
       *[other] Wyše { $limit } wotpowědnikow
    }
pdfjs-find-not-found = Pytanski wuraz njeje so namakał

## Predefined zoom values

pdfjs-page-scale-width = Šěrokosć strony
pdfjs-page-scale-fit = Wulkosć strony
pdfjs-page-scale-auto = Awtomatiske skalowanje
pdfjs-page-scale-actual = Aktualna wulkosć
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Strona { $page }

## Loading indicator messages

pdfjs-loading-error = Při začitowanju PDF je zmylk wustupił.
pdfjs-invalid-file-error = Njepłaćiwa abo wobškodźena PDF-dataja.
pdfjs-missing-file-error = Falowaca PDF-dataja.
pdfjs-unexpected-response-error = Njewočakowana serwerowa wotmołwa.
pdfjs-rendering-error = Při zwobraznjenju strony je zmylk wustupił.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [Typ přispomnjenki: { $type }]
# Variables:
#   $dateObj (Date) - the modification date and time of the annotation
pdfjs-annotation-date-time-string = { DATETIME($dateObj, dateStyle: "short", timeStyle: "medium") }

## Password

pdfjs-password-label = Zapodajće hesło, zo byšće PDF-dataju wočinił.
pdfjs-password-invalid = Njepłaćiwe hesło. Prošu spytajće hišće raz.
pdfjs-password-ok-button = W porjadku
pdfjs-password-cancel-button = Přetorhnyć
pdfjs-web-fonts-disabled = Webpisma su znjemóžnjene: njeje móžno, zasadźene PDF-pisma wužiwać.

## Editing

pdfjs-editor-free-text-button =
    .title = Tekst
pdfjs-editor-color-picker-free-text-input =
    .title = Tekstowu barbu změnić
pdfjs-editor-free-text-button-label = Tekst
pdfjs-editor-ink-button =
    .title = Rysować
pdfjs-editor-color-picker-ink-input =
    .title = Rysowansku barbu změnić
pdfjs-editor-ink-button-label = Rysować
pdfjs-editor-stamp-button =
    .title = Wobrazy přidać abo wobdźěłać
pdfjs-editor-stamp-button-label = Wobrazy přidać abo wobdźěłać
pdfjs-editor-highlight-button =
    .title = Wuzběhnyć
pdfjs-editor-highlight-button-label = Wuzběhnyć
pdfjs-highlight-floating-button1 =
    .title = Wuzběhnjenje
    .aria-label = Wuzběhnjenje
pdfjs-highlight-floating-button-label = Wuzběhnjenje
pdfjs-comment-floating-button =
    .title = Komentować
    .aria-label = Komentować
pdfjs-comment-floating-button-label = Komentować
pdfjs-editor-comment-button =
    .title = Komentować
    .aria-label = Komentować
pdfjs-editor-comment-button-label = Komentować
pdfjs-editor-signature-button =
    .title = Signaturu přidać
pdfjs-editor-signature-button-label = Signaturu přidać

## Default editor aria labels

# “Highlight” is a noun, the string is used on the editor for highlights.
pdfjs-editor-highlight-editor =
    .aria-label = Wuzběhowanski editor
# “Drawing” is a noun, the string is used on the editor for drawings.
pdfjs-editor-ink-editor =
    .aria-label = Rysowanski editor
# Used when a signature editor is selected/hovered.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-signature-editor1 =
    .aria-description = Signaturowy editor: { $description }
pdfjs-editor-stamp-editor =
    .aria-label = Wobrazowy editor

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Rysowanku wotstronić
pdfjs-editor-remove-freetext-button =
    .title = Tekst wotstronić
pdfjs-editor-remove-stamp-button =
    .title = Wobraz wotstronić
pdfjs-editor-remove-highlight-button =
    .title = Wuzběhnjenje wotstronić
pdfjs-editor-remove-signature-button =
    .title = Signaturu wotstronić

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Barba
pdfjs-editor-free-text-size-input = Wulkosć
pdfjs-editor-ink-color-input = Barba
pdfjs-editor-ink-thickness-input = Tołstosć
pdfjs-editor-ink-opacity-input = Opacita
pdfjs-editor-stamp-add-image-button =
    .title = Wobraz přidać
pdfjs-editor-stamp-add-image-button-label = Wobraz přidać
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Tołstosć
pdfjs-editor-free-highlight-thickness-title =
    .title = Tołstosć změnić, hdyž so zapiski wuzběhuja, kotrež tekst njejsu
pdfjs-editor-add-signature-container =
    .aria-label = Wodźenske elementy signaturow a składowane signatury
pdfjs-editor-signature-add-signature-button =
    .title = Nowu signaturu přidać
pdfjs-editor-signature-add-signature-button-label = Nowu signaturu přidać
# Used on the button to use an already saved signature.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-add-saved-signature-button =
    .title = Składowana signatura: { $description }
# .default-content is used as a placeholder in an empty text editor.
pdfjs-free-text2 =
    .aria-label = Tekstowy editor
    .default-content = Započńće pisać …
# Used to show how many comments are present in the pdf file.
# Variables:
#   $count (Number) - the number of comments.
pdfjs-editor-comments-sidebar-title =
    { $count ->
        [one] { $count } komentar
        [two] { $count } komentaraj
        [few] { $count } komentary
       *[other] { $count } komentarow
    }
pdfjs-editor-comments-sidebar-close-button =
    .title = Bóčnicu začinić
    .aria-label = Bóčnicu začinić
pdfjs-editor-comments-sidebar-close-button-label = Bóčnicu začinić
# Instructional copy to add a comment by selecting text or an annotations.
pdfjs-editor-comments-sidebar-no-comments1 = Widźiće něšto přispomnjenja hódneho? Wuzběhńće to a zawostajće komentar.
pdfjs-editor-comments-sidebar-no-comments-link = Dalše informacije

## Alt-text dialog

pdfjs-editor-alt-text-button-label = Alternatiwny tekst
pdfjs-editor-alt-text-edit-button =
    .aria-label = Alternatiwny tekst wobdźěłać
pdfjs-editor-alt-text-dialog-label = Nastajenje wubrać
pdfjs-editor-alt-text-dialog-description = Alternatiwny tekst pomha, hdyž ludźo njemóža wobraz widźeć abo hdyž so wobraz njezačita.
pdfjs-editor-alt-text-add-description-label = Wopisanje přidać
pdfjs-editor-alt-text-add-description-description = Pisajće 1 sadu abo 2 sadźe, kotrejž temu, nastajenje abo akcije wopisujetej.
pdfjs-editor-alt-text-mark-decorative-label = Jako dekoratiwny markěrować
pdfjs-editor-alt-text-mark-decorative-description = To so za pyšace wobrazy wužiwa, na přikład ramiki abo wodowe znamjenja.
pdfjs-editor-alt-text-cancel-button = Přetorhnyć
pdfjs-editor-alt-text-save-button = Składować
pdfjs-editor-alt-text-decorative-tooltip = Jako dekoratiwny markěrowany
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Na přikład, „Młody muž za blidom sedźi, zo by jědź jědł“
# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button =
    .aria-label = Alternatiwny tekst

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-top-left =
    .aria-label = Horjeka nalěwo – wulkosć změnić
pdfjs-editor-resizer-top-middle =
    .aria-label = Horjeka wosrjedź – wulkosć změnić
pdfjs-editor-resizer-top-right =
    .aria-label = Horjeka naprawo – wulkosć změnić
pdfjs-editor-resizer-middle-right =
    .aria-label = Wosrjedź naprawo – wulkosć změnić
pdfjs-editor-resizer-bottom-right =
    .aria-label = Deleka naprawo – wulkosć změnić
pdfjs-editor-resizer-bottom-middle =
    .aria-label = Deleka wosrjedź – wulkosć změnić
pdfjs-editor-resizer-bottom-left =
    .aria-label = Deleka nalěwo – wulkosć změnić
pdfjs-editor-resizer-middle-left =
    .aria-label = Wosrjedź nalěwo – wulkosć změnić

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Barba wuzběhnjenja
pdfjs-editor-colorpicker-button =
    .title = Barbu změnić
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Wuběr barbow
pdfjs-editor-colorpicker-yellow =
    .title = Žołty
pdfjs-editor-colorpicker-green =
    .title = Zeleny
pdfjs-editor-colorpicker-blue =
    .title = Módry
pdfjs-editor-colorpicker-pink =
    .title = Pink
pdfjs-editor-colorpicker-red =
    .title = Čerwjeny

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Wšě pokazać
pdfjs-editor-highlight-show-all-button =
    .title = Wšě pokazać

## New alt-text dialog
## Group note for entire feature: Alternative text (alt text) helps when people can't see the image. This feature includes a tool to create alt text automatically using an AI model that works locally on the user's device to preserve privacy.

# Modal header positioned above a text box where users can edit the alt text.
pdfjs-editor-new-alt-text-dialog-edit-label = Alternatiwny tekst wobdźěłać (wobrazowe wopisanje)
# Modal header positioned above a text box where users can add the alt text.
pdfjs-editor-new-alt-text-dialog-add-label = Alternatiwny tekst přidać (wobrazowe wopisanje)
pdfjs-editor-new-alt-text-textarea =
    .placeholder = Pisajće tu swoje wopisanje…
# This text refers to the alt text box above this description. It offers a definition of alt text.
pdfjs-editor-new-alt-text-description = Krótke wopisanje za ludźi, kotřiž njemóžeće wobraz widźeć abo hdyž so wobraz njezačita.
# This is a required legal disclaimer that refers to the automatically created text inside the alt text box above this text. It disappears if the text is edited by a human.
pdfjs-editor-new-alt-text-disclaimer1 = Tutón alternatiwny tekst je so awtomatisce wutworił a je snano njedokładny.
pdfjs-editor-new-alt-text-disclaimer-learn-more-url = Dalše informacije
pdfjs-editor-new-alt-text-create-automatically-button-label = Alternatiwny tekst awtomatisce wutworić
pdfjs-editor-new-alt-text-not-now-button = Nic nětko
pdfjs-editor-new-alt-text-error-title = Alternatiwny tekst njeda so awtomatisce wutworić
pdfjs-editor-new-alt-text-error-description = Prošu pisajće swój alternatiwny tekst abo spytajće pozdźišo hišće raz.
pdfjs-editor-new-alt-text-error-close-button = Začinić
# Variables:
#   $totalSize (Number) - the total size (in MB) of the AI model.
#   $downloadedSize (Number) - the downloaded size (in MB) of the AI model.
pdfjs-editor-new-alt-text-ai-model-downloading-progress = Model KI za alternatiwny tekst so sćahuje ({ $downloadedSize } z { $totalSize } MB)
    .aria-valuetext = Model KI za alternatiwny tekst so sćahuje ({ $downloadedSize } z { $totalSize } MB)
# This is a button that users can click to edit the alt text they have already added.
pdfjs-editor-new-alt-text-added-button =
    .aria-label = Alternatiwny tekst je so přidał
pdfjs-editor-new-alt-text-added-button-label = Alternatiwny tekst je so přidał
# This is a button that users can click to open the alt text editor and add alt text when it is not present.
pdfjs-editor-new-alt-text-missing-button =
    .aria-label = Alternatiwny tekst faluje
pdfjs-editor-new-alt-text-missing-button-label = Alternatiwny tekst faluje
# This is a button that opens up the alt text modal where users should review the alt text that was automatically generated.
pdfjs-editor-new-alt-text-to-review-button =
    .aria-label = Alternatiwny tekst přepruwować
pdfjs-editor-new-alt-text-to-review-button-label = Alternatiwny tekst přepruwować
# "Created automatically" is a prefix that will be added to the beginning of any alt text that has been automatically generated. After the colon, the user will see/hear the actual alt text description. If the alt text has been edited by a human, this prefix will not appear.
# Variables:
#   $generatedAltText (String) - the generated alt-text.
pdfjs-editor-new-alt-text-generated-alt-text-with-disclaimer = Awtomatisce wutworjeny: { $generatedAltText }

## Image alt-text settings

pdfjs-image-alt-text-settings-button =
    .title = Nastajenja alternatiwneho wobrazoweho teksta
pdfjs-image-alt-text-settings-button-label = Nastajenja alternatiwneho wobrazoweho teksta
pdfjs-editor-alt-text-settings-dialog-label = Nastajenja alternatiwneho wobrazoweho teksta
pdfjs-editor-alt-text-settings-automatic-title = Awtomatiski alternatiwny tekst
pdfjs-editor-alt-text-settings-create-model-button-label = Alternatiwny tekst awtomatisce wutworić
pdfjs-editor-alt-text-settings-create-model-description = Namjetuje wopisanja, zo by ludźom pomhał, kotřiž njemóžeće wobraz widźeć abo hdyž so wobraz njezačita.
# Variables:
#   $totalSize (Number) - the total size (in MB) of the AI model.
pdfjs-editor-alt-text-settings-download-model-label = Model KI alternatiwneho teksta ({ $totalSize } MB)
pdfjs-editor-alt-text-settings-ai-model-description = Běži lokalnje na wašim graće, zo bychu waše daty priwatne wostali. Za awtomatiski alternatiwny tekst trěbny.
pdfjs-editor-alt-text-settings-delete-model-button = Zhašeć
pdfjs-editor-alt-text-settings-download-model-button = Sćahnyć
pdfjs-editor-alt-text-settings-downloading-model-button = Sćahuje so…
pdfjs-editor-alt-text-settings-editor-title = Editor za alternatiwny tekst
pdfjs-editor-alt-text-settings-show-dialog-button-label = Editor alternatiwneho teksta hnydom pokazać, hdyž so wobraz přidawa
pdfjs-editor-alt-text-settings-show-dialog-description = Pomha, wam wšěm swojim wobrazam alternatiwny tekst přidać.
pdfjs-editor-alt-text-settings-close-button = Začinić

## Accessibility labels (announced by screen readers) for objects added to the editor.

pdfjs-editor-highlight-added-alert = Wuzběhnjenje přidate
pdfjs-editor-freetext-added-alert = Tekst přidaty
pdfjs-editor-ink-added-alert = Rysowanka přidata
pdfjs-editor-stamp-added-alert = Wobraz přidaty
pdfjs-editor-signature-added-alert = Signatura přidata

## "Annotations removed" bar

pdfjs-editor-undo-bar-message-highlight = Wotstronjene wuzběhnyć
pdfjs-editor-undo-bar-message-freetext = Tekst je so wotstronił
pdfjs-editor-undo-bar-message-ink = Rysowanka je so wotstroniła
pdfjs-editor-undo-bar-message-stamp = Wobraz je so wotstronił
pdfjs-editor-undo-bar-message-signature = Signatura je so wotstroniła
# Variables:
#   $count (Number) - the number of removed annotations.
pdfjs-editor-undo-bar-message-multiple =
    { $count ->
        [one] { $count } přispomnjenka je so wotstroniła
        [two] { $count } přispomnjence stej so wotstroniłoj
        [few] { $count } přispomnjenki su so wotstronili
       *[other] { $count } přispomnjenkow je so wotstroniło
    }
pdfjs-editor-undo-bar-undo-button =
    .title = Cofnyć
pdfjs-editor-undo-bar-undo-button-label = Cofnyć
pdfjs-editor-undo-bar-close-button =
    .title = Začinić
pdfjs-editor-undo-bar-close-button-label = Začinić

## Add a signature dialog

pdfjs-editor-add-signature-dialog-label = Tutón modalny dialog wužiwarjej zmóžnja, signaturu wutworić, zo by PDF-dokument přidał. Wužiwar móže mjeno wobdźěłać (kotrež tež jako alternatiwny tekst słuži) a po přeću signaturu za wospjetne wužiwanje składować.
pdfjs-editor-add-signature-dialog-title = Signaturu přidać

## Tab names

# Type is a verb (you can type your name as signature)
pdfjs-editor-add-signature-type-button = Typ
    .title = Typ
# Draw is a verb (you can draw your signature)
pdfjs-editor-add-signature-draw-button = Rysować
    .title = Rysować
pdfjs-editor-add-signature-image-button = Wobraz
    .title = Wobraz

## Tab panels

pdfjs-editor-add-signature-type-input =
    .aria-label = Zapodajće swoju signaturu
    .placeholder = Zapodajće swoju signaturu
pdfjs-editor-add-signature-draw-placeholder = Rysujće swoju signaturu
pdfjs-editor-add-signature-draw-thickness-range-label = Tołstosć
# Variables:
#   $thickness (Number) - the thickness (in pixels) of the line used to draw a signature.
pdfjs-editor-add-signature-draw-thickness-range =
    .title = Tołstosć rysowanki: { $thickness }
pdfjs-editor-add-signature-image-placeholder = Ćehńće dataju sem, zo byšće ju nahrał
pdfjs-editor-add-signature-image-browse-link =
    { PLATFORM() ->
        [macos] Abo přepytajće wobrazowe dataje
       *[other] Abo přepytajće wobrazowe dataje
    }

## Controls

pdfjs-editor-add-signature-description-label = Wopisanje (alternatiwny tekst)
pdfjs-editor-add-signature-description-input =
    .title = Wopisanje (alternatiwny tekst)
pdfjs-editor-add-signature-description-default-when-drawing = Signatura
pdfjs-editor-add-signature-clear-button-label = Signaturu zhašeć
pdfjs-editor-add-signature-clear-button =
    .title = Signaturu zhašeć
pdfjs-editor-add-signature-save-checkbox = Signaturu składować
pdfjs-editor-add-signature-save-warning-message = Sće limit 5 składowanych signaturow docpěł. Wotstrońće jednu, zo byšće wjace składował.
pdfjs-editor-add-signature-image-upload-error-title = Wobraz njeda so nahrać
pdfjs-editor-add-signature-image-upload-error-description = Přepruwujće swój syćowy zwisk abo spytajće druhi wobraz.
pdfjs-editor-add-signature-image-no-data-error-title = Tutón wobraz njeda so do signatury přetworić
pdfjs-editor-add-signature-image-no-data-error-description = Spytajće prošu druhi wobraz nahrać.
pdfjs-editor-add-signature-error-close-button = Začinić

## Dialog buttons

pdfjs-editor-add-signature-cancel-button = Přetorhnyć
pdfjs-editor-add-signature-add-button = Přidać
pdfjs-editor-edit-signature-update-button = Aktualizować

## Comment popup

pdfjs-editor-edit-comment-popup-button-label = Komentar wobdźěłać
pdfjs-editor-edit-comment-popup-button =
    .title = Komentar wobdźěłać
pdfjs-editor-delete-comment-popup-button-label = Komentar wotstronić
pdfjs-editor-delete-comment-popup-button =
    .title = Komentar wotstronić
pdfjs-show-comment-button =
    .title = Komentar pokazać

##  Edit a comment dialog

pdfjs-editor-edit-comment-actions-button-label = Akcije
pdfjs-editor-edit-comment-actions-button =
    .title = Akcije
pdfjs-editor-edit-comment-close-button-label = Začinić
pdfjs-editor-edit-comment-close-button =
    .title = Začinić
pdfjs-editor-edit-comment-actions-edit-button-label = Wobdźěłać
pdfjs-editor-edit-comment-actions-delete-button-label = Zhašeć
pdfjs-editor-edit-comment-manager-text-input =
    .placeholder = Zapodajće swój komentar
pdfjs-editor-edit-comment-manager-cancel-button = Přetorhnyć
pdfjs-editor-edit-comment-manager-save-button = Składować
# An existing comment is edited
pdfjs-editor-edit-comment-dialog-title-when-editing = Komentar wobdźěłać
pdfjs-editor-edit-comment-dialog-save-button-when-editing = Aktualizować
# No existing comment
pdfjs-editor-edit-comment-dialog-title-when-adding = Komentar přidać
pdfjs-editor-edit-comment-dialog-save-button-when-adding = Přidać
pdfjs-editor-edit-comment-dialog-text-input =
    .placeholder = Započńće pisać…
pdfjs-editor-edit-comment-dialog-cancel-button = Přetorhnyć

## Edit a comment button in the editor toolbar

pdfjs-editor-edit-comment-button =
    .title = Komentar wobdźěłać
pdfjs-editor-add-comment-button =
    .title = Komentar přidać

## Main menu for adding/removing signatures

pdfjs-editor-delete-signature-button1 =
    .title = Składowanu signaturu wotstronić
pdfjs-editor-delete-signature-button-label1 = Składowanu signaturu wotstronić

## Editor toolbar

pdfjs-editor-add-signature-edit-button-label = Wopisanje wobdźěłać

## Edit signature description dialog

pdfjs-editor-edit-signature-dialog-title = Wopisanje wobdźěłać
