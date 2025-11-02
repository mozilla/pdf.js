# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Foarige side
pdfjs-previous-button-label = Foarige
pdfjs-next-button =
    .title = Folgjende side
pdfjs-next-button-label = Folgjende
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Side
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = fan { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } fan { $pagesCount })
pdfjs-zoom-out-button =
    .title = Utzoome
pdfjs-zoom-out-button-label = Utzoome
pdfjs-zoom-in-button =
    .title = Ynzoome
pdfjs-zoom-in-button-label = Ynzoome
pdfjs-zoom-select =
    .title = Zoome
pdfjs-presentation-mode-button =
    .title = Wikselje nei presintaasjemodus
pdfjs-presentation-mode-button-label = Presintaasjemodus
pdfjs-open-file-button =
    .title = Bestân iepenje
pdfjs-open-file-button-label = Iepenje
pdfjs-print-button =
    .title = Ofdrukke
pdfjs-print-button-label = Ofdrukke
pdfjs-save-button =
    .title = Bewarje
pdfjs-save-button-label = Bewarje
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Downloade
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Downloade
pdfjs-bookmark-button =
    .title = Aktuele side (URL fan aktuele side besjen)
pdfjs-bookmark-button-label = Aktuele side

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Ark
pdfjs-tools-button-label = Ark
pdfjs-first-page-button =
    .title = Gean nei earste side
pdfjs-first-page-button-label = Gean nei earste side
pdfjs-last-page-button =
    .title = Gean nei lêste side
pdfjs-last-page-button-label = Gean nei lêste side
pdfjs-page-rotate-cw-button =
    .title = Rjochtsom draaie
pdfjs-page-rotate-cw-button-label = Rjochtsom draaie
pdfjs-page-rotate-ccw-button =
    .title = Linksom draaie
pdfjs-page-rotate-ccw-button-label = Linksom draaie
pdfjs-cursor-text-select-tool-button =
    .title = Tekstseleksjehelpmiddel ynskeakelje
pdfjs-cursor-text-select-tool-button-label = Tekstseleksjehelpmiddel
pdfjs-cursor-hand-tool-button =
    .title = Hânhelpmiddel ynskeakelje
pdfjs-cursor-hand-tool-button-label = Hânhelpmiddel
pdfjs-scroll-page-button =
    .title = Sideskowen brûke
pdfjs-scroll-page-button-label = Sideskowen
pdfjs-scroll-vertical-button =
    .title = Fertikaal skowe brûke
pdfjs-scroll-vertical-button-label = Fertikaal skowe
pdfjs-scroll-horizontal-button =
    .title = Horizontaal skowe brûke
pdfjs-scroll-horizontal-button-label = Horizontaal skowe
pdfjs-scroll-wrapped-button =
    .title = Skowe mei oersjoch brûke
pdfjs-scroll-wrapped-button-label = Skowe mei oersjoch
pdfjs-spread-none-button =
    .title = Sidesprieding net gearfetsje
pdfjs-spread-none-button-label = Gjin sprieding
pdfjs-spread-odd-button =
    .title = Sidesprieding gearfetsje te starten mei ûneven nûmers
pdfjs-spread-odd-button-label = Uneven sprieding
pdfjs-spread-even-button =
    .title = Sidesprieding gearfetsje te starten mei even nûmers
pdfjs-spread-even-button-label = Even sprieding

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokuminteigenskippen…
pdfjs-document-properties-button-label = Dokuminteigenskippen…
pdfjs-document-properties-file-name = Bestânsnamme:
pdfjs-document-properties-file-size = Bestânsgrutte:
# Variables:
#   $kb (Number) - the PDF file size in kilobytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-kb = { NUMBER($kb, maximumSignificantDigits: 3) } KB ({ $b } bytes)
# Variables:
#   $mb (Number) - the PDF file size in megabytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-mb = { NUMBER($mb, maximumSignificantDigits: 3) } MB ({ $b } bytes)
pdfjs-document-properties-title = Titel:
pdfjs-document-properties-author = Auteur:
pdfjs-document-properties-subject = Underwerp:
pdfjs-document-properties-keywords = Kaaiwurden:
pdfjs-document-properties-creation-date = Oanmaakdatum:
pdfjs-document-properties-modification-date = Bewurkingsdatum:
# Variables:
#   $dateObj (Date) - the creation/modification date and time of the PDF file
pdfjs-document-properties-date-time-string = { DATETIME($dateObj, dateStyle: "short", timeStyle: "medium") }
pdfjs-document-properties-creator = Makker:
pdfjs-document-properties-producer = PDF-makker:
pdfjs-document-properties-version = PDF-ferzje:
pdfjs-document-properties-page-count = Siden:
pdfjs-document-properties-page-size = Sideformaat:
pdfjs-document-properties-page-size-unit-inches = yn
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = steand
pdfjs-document-properties-page-size-orientation-landscape = lizzend
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Letter
pdfjs-document-properties-page-size-name-legal = Juridysk

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
pdfjs-document-properties-linearized = Flugge webwerjefte:
pdfjs-document-properties-linearized-yes = Ja
pdfjs-document-properties-linearized-no = Nee
pdfjs-document-properties-close-button = Slute

## Print

pdfjs-print-progress-message = Dokumint tariede oar ôfdrukken…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Annulearje
pdfjs-printing-not-supported = Warning: Printen is net folslein stipe troch dizze browser.
pdfjs-printing-not-ready = Warning: PDF is net folslein laden om ôf te drukken.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Sidebalke yn-/útskeakelje
pdfjs-toggle-sidebar-notification-button =
    .title = Sidebalke yn-/útskeakelje (dokumint befettet oersjoch/bylagen/lagen)
pdfjs-toggle-sidebar-button-label = Sidebalke yn-/útskeakelje
pdfjs-document-outline-button =
    .title = Dokumintoersjoch toane (dûbelklik om alle items út/yn te klappen)
pdfjs-document-outline-button-label = Dokumintoersjoch
pdfjs-attachments-button =
    .title = Bylagen toane
pdfjs-attachments-button-label = Bylagen
pdfjs-layers-button =
    .title = Lagen toane (dûbelklik om alle lagen nei de standertsteat werom te setten)
pdfjs-layers-button-label = Lagen
pdfjs-thumbs-button =
    .title = Foarbylden toane
pdfjs-thumbs-button-label = Foarbylden
pdfjs-current-outline-item-button =
    .title = Aktueel item yn ynhâldsopjefte sykje
pdfjs-current-outline-item-button-label = Aktueel item yn ynhâldsopjefte
pdfjs-findbar-button =
    .title = Sykje yn dokumint
pdfjs-findbar-button-label = Sykje
pdfjs-additional-layers = Oanfoljende lagen

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Side { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Foarbyld fan side { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Sykje
    .placeholder = Sykje yn dokumint…
pdfjs-find-previous-button =
    .title = It foarige foarkommen fan de tekst sykje
pdfjs-find-previous-button-label = Foarige
pdfjs-find-next-button =
    .title = It folgjende foarkommen fan de tekst sykje
pdfjs-find-next-button-label = Folgjende
pdfjs-find-highlight-checkbox = Alles markearje
pdfjs-find-match-case-checkbox-label = Haadlettergefoelich
pdfjs-find-match-diacritics-checkbox-label = Diakrityske tekens brûke
pdfjs-find-entire-word-checkbox-label = Hiele wurden
pdfjs-find-reached-top = Boppekant fan dokumint berikt, trochgien fan ûnder ôf
pdfjs-find-reached-bottom = Ein fan dokumint berikt, trochgien fan boppe ôf
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } fan { $total } oerienkomst
       *[other] { $current } fan { $total } oerienkomsten
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Mear as { $limit } oerienkomst
       *[other] Mear as { $limit } oerienkomsten
    }
pdfjs-find-not-found = Tekst net fûn

## Predefined zoom values

pdfjs-page-scale-width = Sidebreedte
pdfjs-page-scale-fit = Hiele side
pdfjs-page-scale-auto = Automatysk zoome
pdfjs-page-scale-actual = Werklike grutte
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Side { $page }

## Loading indicator messages

pdfjs-loading-error = Der is in flater bard by it laden fan de PDF.
pdfjs-invalid-file-error = Ynfalide of korruptearre PDF-bestân.
pdfjs-missing-file-error = PDF-bestân ûntbrekt.
pdfjs-unexpected-response-error = Unferwacht serverantwurd.
pdfjs-rendering-error = Der is in flater bard by it renderjen fan de side.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type }-annotaasje]
# Variables:
#   $dateObj (Date) - the modification date and time of the annotation
pdfjs-annotation-date-time-string = { DATETIME($dateObj, dateStyle: "short", timeStyle: "medium") }

## Password

pdfjs-password-label = Jou it wachtwurd om dit PDF-bestân te iepenjen.
pdfjs-password-invalid = Ferkeard wachtwurd. Probearje opnij.
pdfjs-password-ok-button = OK
pdfjs-password-cancel-button = Annulearje
pdfjs-web-fonts-disabled = Weblettertypen binne útskeakele: gebrûk fan ynsluten PDF-lettertypen is net mooglik.

## Editing

pdfjs-editor-free-text-button =
    .title = Tekst
pdfjs-editor-color-picker-free-text-input =
    .title = Tekstleur wizigje
pdfjs-editor-free-text-button-label = Tekst
pdfjs-editor-ink-button =
    .title = Tekenje
pdfjs-editor-color-picker-ink-input =
    .title = Tekenkleur wizigje
pdfjs-editor-ink-button-label = Tekenje
pdfjs-editor-stamp-button =
    .title = Ofbyldingen tafoegje of bewurkje
pdfjs-editor-stamp-button-label = Ofbyldingen tafoegje of bewurkje
pdfjs-editor-highlight-button =
    .title = Markearje
pdfjs-editor-highlight-button-label = Markearje
pdfjs-highlight-floating-button1 =
    .title = Markearje
    .aria-label = Markearje
pdfjs-highlight-floating-button-label = Markearje
pdfjs-comment-floating-button =
    .title = Opmerking
    .aria-label = Opmerking
pdfjs-comment-floating-button-label = Opmerking
pdfjs-editor-comment-button =
    .title = Opmerking
    .aria-label = Opmerking
pdfjs-editor-comment-button-label = Opmerking
pdfjs-editor-signature-button =
    .title = Hantekening tafoegje
pdfjs-editor-signature-button-label = Hantekening tafoegje

## Default editor aria labels

# “Highlight” is a noun, the string is used on the editor for highlights.
pdfjs-editor-highlight-editor =
    .aria-label = Markearingsbewurker
# “Drawing” is a noun, the string is used on the editor for drawings.
pdfjs-editor-ink-editor =
    .aria-label = Tekeningbewurker
# Used when a signature editor is selected/hovered.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-signature-editor1 =
    .aria-description = Undertekeningsbewurker: { $description }
pdfjs-editor-stamp-editor =
    .aria-label = Ofbyldingsbewurker

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Tekening fuortsmite
pdfjs-editor-remove-freetext-button =
    .title = Tekst fuortsmite
pdfjs-editor-remove-stamp-button =
    .title = Ofbylding fuortsmite
pdfjs-editor-remove-highlight-button =
    .title = Markearring fuortsmite
pdfjs-editor-remove-signature-button =
    .title = Hantekening fuortsmite

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Kleur
pdfjs-editor-free-text-size-input = Grutte
pdfjs-editor-ink-color-input = Kleur
pdfjs-editor-ink-thickness-input = Tsjokte
pdfjs-editor-ink-opacity-input = Transparânsje
pdfjs-editor-stamp-add-image-button =
    .title = Ofbylding tafoegje
pdfjs-editor-stamp-add-image-button-label = Ofbylding tafoegje
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Tsjokte
pdfjs-editor-free-highlight-thickness-title =
    .title = Tsjokte wizigje by aksintuearring fan oare items as tekst
pdfjs-editor-add-signature-container =
    .aria-label = Undertekeningsynstellingen en bewarre ûndertekeningen
pdfjs-editor-signature-add-signature-button =
    .title = Nije hantekening tafoegje
pdfjs-editor-signature-add-signature-button-label = Nije hantekening tafoegje
# Used on the button to use an already saved signature.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-add-saved-signature-button =
    .title = Bewarre ûndertekening: { $description }
# .default-content is used as a placeholder in an empty text editor.
pdfjs-free-text2 =
    .aria-label = Tekstbewurker
    .default-content = Start mei typen…
# Used to show how many comments are present in the pdf file.
# Variables:
#   $count (Number) - the number of comments.
pdfjs-editor-comments-sidebar-title =
    { $count ->
        [one] Opmerking
       *[other] Opmerkingen
    }
pdfjs-editor-comments-sidebar-close-button =
    .title = De sydbalke slute
    .aria-label = De sydbalke slute
pdfjs-editor-comments-sidebar-close-button-label = De sydbalke slute
# Instructional copy to add a comment by selecting text or an annotations.
pdfjs-editor-comments-sidebar-no-comments1 = Sjogge jo wat it neamen wurdich? Markearje it en lit in opmerking efter.
pdfjs-editor-comments-sidebar-no-comments-link = Mear ynfo

## Alt-text dialog

pdfjs-editor-alt-text-button-label = Alternative tekst
pdfjs-editor-alt-text-edit-button =
    .aria-label = Alternative tekst bewurkje
pdfjs-editor-alt-text-dialog-label = Kies in opsje
pdfjs-editor-alt-text-dialog-description = Alternative tekst helpt wannear’t minsken de ôfbylding net sjen kinne of wannear’t dizze net laden wurdt.
pdfjs-editor-alt-text-add-description-label = Foegje in beskriuwing ta
pdfjs-editor-alt-text-add-description-description = Stribje nei 1-2 sinnen dy’t it ûnderwerp, de omjouwing of de aksjes beskriuwe.
pdfjs-editor-alt-text-mark-decorative-label = As dekoratyf markearje
pdfjs-editor-alt-text-mark-decorative-description = Dit wurdt brûkt foar sierlike ôfbyldingen, lykas rânen of wettermerken.
pdfjs-editor-alt-text-cancel-button = Annulearje
pdfjs-editor-alt-text-save-button = Bewarje
pdfjs-editor-alt-text-decorative-tooltip = As dekoratyf markearre
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Bygelyks, ‘In jonge man sit oan in tafel om te iten’
# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button =
    .aria-label = Alternative tekst

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-top-left =
    .aria-label = Linkerboppehoek – formaat wizigje
pdfjs-editor-resizer-top-middle =
    .aria-label = Midden boppe – formaat wizigje
pdfjs-editor-resizer-top-right =
    .aria-label = Rjochterboppehoek – formaat wizigje
pdfjs-editor-resizer-middle-right =
    .aria-label = Midden rjochts – formaat wizigje
pdfjs-editor-resizer-bottom-right =
    .aria-label = Rjochterûnderhoek – formaat wizigje
pdfjs-editor-resizer-bottom-middle =
    .aria-label = Midden ûnder – formaat wizigje
pdfjs-editor-resizer-bottom-left =
    .aria-label = Linkerûnderhoek – formaat wizigje
pdfjs-editor-resizer-middle-left =
    .aria-label = Links midden – formaat wizigje

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Markearringskleur
pdfjs-editor-colorpicker-button =
    .title = Kleur wizigje
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Kleurkarren
pdfjs-editor-colorpicker-yellow =
    .title = Giel
pdfjs-editor-colorpicker-green =
    .title = Grien
pdfjs-editor-colorpicker-blue =
    .title = Blau
pdfjs-editor-colorpicker-pink =
    .title = Roze
pdfjs-editor-colorpicker-red =
    .title = Read

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Alles toane
pdfjs-editor-highlight-show-all-button =
    .title = Alles toane

## New alt-text dialog
## Group note for entire feature: Alternative text (alt text) helps when people can't see the image. This feature includes a tool to create alt text automatically using an AI model that works locally on the user's device to preserve privacy.

# Modal header positioned above a text box where users can edit the alt text.
pdfjs-editor-new-alt-text-dialog-edit-label = Alternative tekst (ôfbyldingsbeskriuwing) bewurkje
# Modal header positioned above a text box where users can add the alt text.
pdfjs-editor-new-alt-text-dialog-add-label = Alternative tekst (ôfbyldingsbeskriuwing) tafoegje
pdfjs-editor-new-alt-text-textarea =
    .placeholder = Skriuw hjir jo beskriuwing…
# This text refers to the alt text box above this description. It offers a definition of alt text.
pdfjs-editor-new-alt-text-description = Koarte beskriuwing foar minsken dy’t de ôfbylding net sjen kinne of wannear’t de ôfbylding net laden wurdt.
# This is a required legal disclaimer that refers to the automatically created text inside the alt text box above this text. It disappears if the text is edited by a human.
pdfjs-editor-new-alt-text-disclaimer1 = Dizze alternative tekst is automatysk makke en is mooglik net korrekt.
pdfjs-editor-new-alt-text-disclaimer-learn-more-url = Mear ynfo
pdfjs-editor-new-alt-text-create-automatically-button-label = Alternative tekst automatysk oanmeitsje
pdfjs-editor-new-alt-text-not-now-button = No net
pdfjs-editor-new-alt-text-error-title = Kin alternative tekst net automatysk oanmeitsje
pdfjs-editor-new-alt-text-error-description = Skriuw jo eigen alternative tekst of probearje it letter nochris.
pdfjs-editor-new-alt-text-error-close-button = Slute
# Variables:
#   $totalSize (Number) - the total size (in MB) of the AI model.
#   $downloadedSize (Number) - the downloaded size (in MB) of the AI model.
pdfjs-editor-new-alt-text-ai-model-downloading-progress = AI-model foar alternative tekst downloade ({ $downloadedSize } fan { $totalSize } MB)
    .aria-valuetext = AI-model foar alternative tekst downloade ({ $downloadedSize } fan { $totalSize } MB)
# This is a button that users can click to edit the alt text they have already added.
pdfjs-editor-new-alt-text-added-button =
    .aria-label = Alternative tekst tafoege
pdfjs-editor-new-alt-text-added-button-label = Alternative tekst tafoege
# This is a button that users can click to open the alt text editor and add alt text when it is not present.
pdfjs-editor-new-alt-text-missing-button =
    .aria-label = Alternative tekst ûntbrekt
pdfjs-editor-new-alt-text-missing-button-label = Alternative tekst ûntbrekt
# This is a button that opens up the alt text modal where users should review the alt text that was automatically generated.
pdfjs-editor-new-alt-text-to-review-button =
    .aria-label = Alternative tekst beoardiele
pdfjs-editor-new-alt-text-to-review-button-label = Alternative tekst beoardiele
# "Created automatically" is a prefix that will be added to the beginning of any alt text that has been automatically generated. After the colon, the user will see/hear the actual alt text description. If the alt text has been edited by a human, this prefix will not appear.
# Variables:
#   $generatedAltText (String) - the generated alt-text.
pdfjs-editor-new-alt-text-generated-alt-text-with-disclaimer = Automatysk oanmakke: { $generatedAltText }

## Image alt-text settings

pdfjs-image-alt-text-settings-button =
    .title = Ynstellingen foar alternative tekst fan ôfbyldingen
pdfjs-image-alt-text-settings-button-label = Ynstellingen foar alternative tekst fan ôfbyldingen
pdfjs-editor-alt-text-settings-dialog-label = Ynstellingen foar alternative tekst fan ôfbyldingen
pdfjs-editor-alt-text-settings-automatic-title = Automatyske alternative tekst
pdfjs-editor-alt-text-settings-create-model-button-label = Alternative tekst automatysk oanmeitsje
pdfjs-editor-alt-text-settings-create-model-description = Stelt beskriuwingen foar om minsken te helpen dy’t de ôfbylding net sjen kinne of foar wa’t de ôfbylding net laden wurdt.
# Variables:
#   $totalSize (Number) - the total size (in MB) of the AI model.
pdfjs-editor-alt-text-settings-download-model-label = AI-model foar alternative tekst ({ $totalSize } MB)
pdfjs-editor-alt-text-settings-ai-model-description = Wurdt lokaal op jo apparaat útfierd, sadat jo gegevens privee bliuwe. Fereaske foar automatyske alternative tekst.
pdfjs-editor-alt-text-settings-delete-model-button = Fuortsmite
pdfjs-editor-alt-text-settings-download-model-button = Downloade
pdfjs-editor-alt-text-settings-downloading-model-button = Downloade…
pdfjs-editor-alt-text-settings-editor-title = Alternative-tekstbewurker
pdfjs-editor-alt-text-settings-show-dialog-button-label = Alternative-tekstbewurker daliks toane by tafoegjen fan in ôfbylding
pdfjs-editor-alt-text-settings-show-dialog-description = Helpt jo derfoar te soargjen dat al jo ôfbyldingen alternative tekst hawwe.
pdfjs-editor-alt-text-settings-close-button = Slute

## Accessibility labels (announced by screen readers) for objects added to the editor.

pdfjs-editor-highlight-added-alert = Markearring tafoege
pdfjs-editor-freetext-added-alert = Tekst tafoege
pdfjs-editor-ink-added-alert = Tekening tafoege
pdfjs-editor-stamp-added-alert = Ofbylding tafoege
pdfjs-editor-signature-added-alert = Hantekening tafoege

## "Annotations removed" bar

pdfjs-editor-undo-bar-message-highlight = Markearring fuortsmiten
pdfjs-editor-undo-bar-message-freetext = Tekst fuortsmiten
pdfjs-editor-undo-bar-message-ink = Tekening fuortsmiten
pdfjs-editor-undo-bar-message-stamp = Ofbylding fuortsmiten
pdfjs-editor-undo-bar-message-signature = Hantekening fuortsmiten
# Variables:
#   $count (Number) - the number of removed annotations.
pdfjs-editor-undo-bar-message-multiple =
    { $count ->
        [one] { $count } annotaasje fuortsmiten
       *[other] { $count } annotaasjes fuortsmiten
    }
pdfjs-editor-undo-bar-undo-button =
    .title = Ungedien meitsje
pdfjs-editor-undo-bar-undo-button-label = Ungedien meitsje
pdfjs-editor-undo-bar-close-button =
    .title = Slute
pdfjs-editor-undo-bar-close-button-label = Slute

## Add a signature dialog

pdfjs-editor-add-signature-dialog-label = Mei dizze modal kin de brûker in hantekening meitsje om oan in PDF-dokumint ta te foegjen. De brûker kin de namme bewurkje (dy't ek tsjinnet as alternative tekst), en opsjoneel de ûndertekening bewarje foar werhelle gebrûk.
pdfjs-editor-add-signature-dialog-title = In hantekening tafoegje

## Tab names

# Type is a verb (you can type your name as signature)
pdfjs-editor-add-signature-type-button = Type
    .title = Type
# Draw is a verb (you can draw your signature)
pdfjs-editor-add-signature-draw-button = Tekenje
    .title = Tekenje
pdfjs-editor-add-signature-image-button = Ofbylding
    .title = Ofbylding

## Tab panels

pdfjs-editor-add-signature-type-input =
    .aria-label = Jo hantekening type
    .placeholder = Jo hantekening type
pdfjs-editor-add-signature-draw-placeholder = Jo hantekening tekenje
pdfjs-editor-add-signature-draw-thickness-range-label = Tsjokte
# Variables:
#   $thickness (Number) - the thickness (in pixels) of the line used to draw a signature.
pdfjs-editor-add-signature-draw-thickness-range =
    .title = Tekentsjokte: { $thickness }
pdfjs-editor-add-signature-image-placeholder = Sleep bestân hjirhinne om op te laden
pdfjs-editor-add-signature-image-browse-link =
    { PLATFORM() ->
        [macos] Of kies ôfbyldingsbestannen
       *[other] Of kies ôfbyldingsbestannen
    }

## Controls

pdfjs-editor-add-signature-description-label = Beskriuwing (alternative tekst)
pdfjs-editor-add-signature-description-input =
    .title = Beskriuwing (alternative tekst)
pdfjs-editor-add-signature-description-default-when-drawing = Hantekening
pdfjs-editor-add-signature-clear-button-label = Hantekening wiskje
pdfjs-editor-add-signature-clear-button =
    .title = Hantekening wiskje
pdfjs-editor-add-signature-save-checkbox = Hantekening bewarje
pdfjs-editor-add-signature-save-warning-message = Jo hawwe de limyt fan 5 bewarre hantekeningen berikt. Ferwiderje ien om in oar te bewarjen.
pdfjs-editor-add-signature-image-upload-error-title = Kin de ôfbylding net oplade
pdfjs-editor-add-signature-image-upload-error-description = Kontrolearje jo netwurkferbining of probearje in oare ôfbylding.
pdfjs-editor-add-signature-image-no-data-error-title = Kin dizze ôfbylding net nei in hantekening konvertearje
pdfjs-editor-add-signature-image-no-data-error-description = Probearje in oare ôfbylding op te laden.
pdfjs-editor-add-signature-error-close-button = Slute

## Dialog buttons

pdfjs-editor-add-signature-cancel-button = Annulearje
pdfjs-editor-add-signature-add-button = Tafoegje
pdfjs-editor-edit-signature-update-button = Bywurkje

## Comment popup

pdfjs-editor-edit-comment-popup-button-label = Opmerking bewurkje
pdfjs-editor-edit-comment-popup-button =
    .title = Opmerking bewurkje
pdfjs-editor-delete-comment-popup-button-label = Opmerking fuortsmite
pdfjs-editor-delete-comment-popup-button =
    .title = Opmerking fuortsmite
pdfjs-show-comment-button =
    .title = Opmerking toane

##  Edit a comment dialog

pdfjs-editor-edit-comment-actions-button-label = Aksjes
pdfjs-editor-edit-comment-actions-button =
    .title = Aksjes
pdfjs-editor-edit-comment-close-button-label = Slute
pdfjs-editor-edit-comment-close-button =
    .title = Slute
pdfjs-editor-edit-comment-actions-edit-button-label = Bewurkje
pdfjs-editor-edit-comment-actions-delete-button-label = Fuortsmite
pdfjs-editor-edit-comment-manager-text-input =
    .placeholder = Fier jo opmerking yn
pdfjs-editor-edit-comment-manager-cancel-button = Annulearje
pdfjs-editor-edit-comment-manager-save-button = Bewarje
# An existing comment is edited
pdfjs-editor-edit-comment-dialog-title-when-editing = Opmerking bewurkje
pdfjs-editor-edit-comment-dialog-save-button-when-editing = Bywurkje
# No existing comment
pdfjs-editor-edit-comment-dialog-title-when-adding = Opmerking tafoegje
pdfjs-editor-edit-comment-dialog-save-button-when-adding = Tafoegje
pdfjs-editor-edit-comment-dialog-text-input =
    .placeholder = Begjin mei typen…
pdfjs-editor-edit-comment-dialog-cancel-button = Annulearje

## Edit a comment button in the editor toolbar

pdfjs-editor-edit-comment-button =
    .title = Opmerking bewurkje
pdfjs-editor-add-comment-button =
    .title = Opmerking tafoegje

## Main menu for adding/removing signatures

pdfjs-editor-delete-signature-button1 =
    .title = Bewarre ûndertekening fuortsmite
pdfjs-editor-delete-signature-button-label1 = Bewarre ûndertekening fuortsmite

## Editor toolbar

pdfjs-editor-add-signature-edit-button-label = Beskriuwing bewurkje

## Edit signature description dialog

pdfjs-editor-edit-signature-dialog-title = Beskriuwing bewurkje
