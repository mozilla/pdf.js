# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Aurreko orria
pdfjs-previous-button-label = Aurrekoa
pdfjs-next-button =
    .title = Hurrengo orria
pdfjs-next-button-label = Hurrengoa
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Orria
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = / { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = { $pagesCount }/{ $pageNumber }
pdfjs-zoom-out-button =
    .title = Urrundu zooma
pdfjs-zoom-out-button-label = Urrundu zooma
pdfjs-zoom-in-button =
    .title = Gerturatu zooma
pdfjs-zoom-in-button-label = Gerturatu zooma
pdfjs-zoom-select =
    .title = Zooma
pdfjs-presentation-mode-button =
    .title = Aldatu aurkezpen modura
pdfjs-presentation-mode-button-label = Arkezpen modua
pdfjs-open-file-button =
    .title = Ireki fitxategia
pdfjs-open-file-button-label = Ireki
pdfjs-print-button =
    .title = Inprimatu
pdfjs-print-button-label = Inprimatu
pdfjs-save-button =
    .title = Gorde
pdfjs-save-button-label = Gorde
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Deskargatu
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Deskargatu
pdfjs-bookmark-button =
    .title = Uneko orria (ikusi uneko orriaren URLa)
pdfjs-bookmark-button-label = Uneko orria

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Tresnak
pdfjs-tools-button-label = Tresnak
pdfjs-first-page-button =
    .title = Joan lehen orrira
pdfjs-first-page-button-label = Joan lehen orrira
pdfjs-last-page-button =
    .title = Joan azken orrira
pdfjs-last-page-button-label = Joan azken orrira
pdfjs-page-rotate-cw-button =
    .title = Biratu erlojuaren norantzan
pdfjs-page-rotate-cw-button-label = Biratu erlojuaren norantzan
pdfjs-page-rotate-ccw-button =
    .title = Biratu erlojuaren aurkako norantzan
pdfjs-page-rotate-ccw-button-label = Biratu erlojuaren aurkako norantzan
pdfjs-cursor-text-select-tool-button =
    .title = Gaitu testuaren hautapen tresna
pdfjs-cursor-text-select-tool-button-label = Testuaren hautapen tresna
pdfjs-cursor-hand-tool-button =
    .title = Gaitu eskuaren tresna
pdfjs-cursor-hand-tool-button-label = Eskuaren tresna
pdfjs-scroll-page-button =
    .title = Erabili orriaren korritzea
pdfjs-scroll-page-button-label = Orriaren korritzea
pdfjs-scroll-vertical-button =
    .title = Erabili korritze bertikala
pdfjs-scroll-vertical-button-label = Korritze bertikala
pdfjs-scroll-horizontal-button =
    .title = Erabili korritze horizontala
pdfjs-scroll-horizontal-button-label = Korritze horizontala
pdfjs-scroll-wrapped-button =
    .title = Erabili korritze egokitua
pdfjs-scroll-wrapped-button-label = Korritze egokitua
pdfjs-spread-none-button =
    .title = Ez elkartu barreiatutako orriak
pdfjs-spread-none-button-label = Barreiatzerik ez
pdfjs-spread-odd-button =
    .title = Elkartu barreiatutako orriak bakoiti zenbakidunekin hasita
pdfjs-spread-odd-button-label = Barreiatze bakoitia
pdfjs-spread-even-button =
    .title = Elkartu barreiatutako orriak bikoiti zenbakidunekin hasita
pdfjs-spread-even-button-label = Barreiatze bikoitia

## Document properties dialog

pdfjs-document-properties-button =
    .title = Dokumentuaren propietateak…
pdfjs-document-properties-button-label = Dokumentuaren propietateak…
pdfjs-document-properties-file-name = Fitxategi-izena:
pdfjs-document-properties-file-size = Fitxategiaren tamaina:
# Variables:
#   $kb (Number) - the PDF file size in kilobytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-kb = { NUMBER($kb, maximumSignificantDigits: 3) } KB ({ $b } byte)
# Variables:
#   $mb (Number) - the PDF file size in megabytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-mb = { NUMBER($mb, maximumSignificantDigits: 3) } MB ({ $b } byte)
pdfjs-document-properties-title = Izenburua:
pdfjs-document-properties-author = Egilea:
pdfjs-document-properties-subject = Gaia:
pdfjs-document-properties-keywords = Gako-hitzak:
pdfjs-document-properties-creation-date = Sortze-data:
pdfjs-document-properties-modification-date = Aldatze-data:
# Variables:
#   $dateObj (Date) - the creation/modification date and time of the PDF file
pdfjs-document-properties-date-time-string = { DATETIME($dateObj, dateStyle: "short", timeStyle: "medium") }
pdfjs-document-properties-creator = Sortzailea:
pdfjs-document-properties-producer = PDFaren ekoizlea:
pdfjs-document-properties-version = PDF bertsioa:
pdfjs-document-properties-page-count = Orrialde kopurua:
pdfjs-document-properties-page-size = Orriaren tamaina:
pdfjs-document-properties-page-size-unit-inches = in
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = bertikala
pdfjs-document-properties-page-size-orientation-landscape = horizontala
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Gutuna
pdfjs-document-properties-page-size-name-legal = Legala

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
pdfjs-document-properties-linearized = Webeko ikuspegi bizkorra:
pdfjs-document-properties-linearized-yes = Bai
pdfjs-document-properties-linearized-no = Ez
pdfjs-document-properties-close-button = Itxi

## Print

pdfjs-print-progress-message = Dokumentua inprimatzeko prestatzen…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = %{ $progress }
pdfjs-print-progress-close-button = Utzi
pdfjs-printing-not-supported = Abisua: inprimatzeko euskarria ez da erabatekoa nabigatzaile honetan.
pdfjs-printing-not-ready = Abisua: PDFa ez dago erabat kargatuta inprimatzeko.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Txandakatu alboko barra
pdfjs-toggle-sidebar-notification-button =
    .title = Txandakatu alboko barra (dokumentuak eskema/eranskinak/geruzak ditu)
pdfjs-toggle-sidebar-button-label = Txandakatu alboko barra
pdfjs-document-outline-button =
    .title = Erakutsi dokumentuaren eskema (klik bikoitza elementu guztiak zabaltzeko/tolesteko)
pdfjs-document-outline-button-label = Dokumentuaren eskema
pdfjs-attachments-button =
    .title = Erakutsi eranskinak
pdfjs-attachments-button-label = Eranskinak
pdfjs-layers-button =
    .title = Erakutsi geruzak (klik bikoitza geruza guztiak egoera lehenetsira berrezartzeko)
pdfjs-layers-button-label = Geruzak
pdfjs-thumbs-button =
    .title = Erakutsi koadro txikiak
pdfjs-thumbs-button-label = Koadro txikiak
pdfjs-current-outline-item-button =
    .title = Bilatu uneko eskemaren elementua
pdfjs-current-outline-item-button-label = Uneko eskemaren elementua
pdfjs-findbar-button =
    .title = Bilatu dokumentuan
pdfjs-findbar-button-label = Bilatu
pdfjs-additional-layers = Geruza gehigarriak

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = { $page }. orria
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = { $page }. orriaren koadro txikia

## Find panel button title and messages

pdfjs-find-input =
    .title = Bilatu
    .placeholder = Bilatu dokumentuan…
pdfjs-find-previous-button =
    .title = Bilatu esaldiaren aurreko parekatzea
pdfjs-find-previous-button-label = Aurrekoa
pdfjs-find-next-button =
    .title = Bilatu esaldiaren hurrengo parekatzea
pdfjs-find-next-button-label = Hurrengoa
pdfjs-find-highlight-checkbox = Nabarmendu guztia
pdfjs-find-match-case-checkbox-label = Bat etorri maiuskulekin/minuskulekin
pdfjs-find-match-diacritics-checkbox-label = Bereizi diakritikoak
pdfjs-find-entire-word-checkbox-label = Hitz osoak
pdfjs-find-reached-top = Dokumentuaren hasierara heldu da, bukaeratik jarraitzen
pdfjs-find-reached-bottom = Dokumentuaren bukaerara heldu da, hasieratik jarraitzen
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $total }/{ $current }. bat-etortzea
       *[other] { $total }/{ $current }. bat-etortzea
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Bat datorren { $limit } baino gehiago
       *[other] Bat datozen { $limit } baino gehiago
    }
pdfjs-find-not-found = Esaldia ez da aurkitu

## Predefined zoom values

pdfjs-page-scale-width = Orriaren zabalera
pdfjs-page-scale-fit = Doitu orrira
pdfjs-page-scale-auto = Zoom automatikoa
pdfjs-page-scale-actual = Benetako tamaina
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = %{ $scale }

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = { $page }. orria

## Loading indicator messages

pdfjs-loading-error = Errorea gertatu da PDFa kargatzean.
pdfjs-invalid-file-error = PDF fitxategi baliogabe edo hondatua.
pdfjs-missing-file-error = PDF fitxategia falta da.
pdfjs-unexpected-response-error = Espero gabeko zerbitzariaren erantzuna.
pdfjs-rendering-error = Errorea gertatu da orria errendatzean.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } ohartarazpena]
# Variables:
#   $dateObj (Date) - the modification date and time of the annotation
pdfjs-annotation-date-time-string = { DATETIME($dateObj, dateStyle: "short", timeStyle: "medium") }

## Password

pdfjs-password-label = Idatzi PDF fitxategi hau irekitzeko pasahitza.
pdfjs-password-invalid = Pasahitz baliogabea. Saiatu berriro mesedez.
pdfjs-password-ok-button = Ados
pdfjs-password-cancel-button = Utzi
pdfjs-web-fonts-disabled = Webeko letra-tipoak desgaituta daude: ezin dira kapsulatutako PDF letra-tipoak erabili.

## Editing

pdfjs-editor-free-text-button =
    .title = Testua
pdfjs-editor-color-picker-free-text-input =
    .title = Aldatu testuaren kolorea
pdfjs-editor-free-text-button-label = Testua
pdfjs-editor-ink-button =
    .title = Marrazkia
pdfjs-editor-color-picker-ink-input =
    .title = Aldatu marrazteko kolorea
pdfjs-editor-ink-button-label = Marrazkia
pdfjs-editor-stamp-button =
    .title = Gehitu edo editatu irudiak
pdfjs-editor-stamp-button-label = Gehitu edo editatu irudiak
pdfjs-editor-highlight-button =
    .title = Nabarmendu
pdfjs-editor-highlight-button-label = Nabarmendu
pdfjs-highlight-floating-button1 =
    .title = Nabarmendu
    .aria-label = Nabarmendu
pdfjs-highlight-floating-button-label = Nabarmendu
pdfjs-comment-floating-button =
    .title = Iruzkina
    .aria-label = Iruzkina
pdfjs-comment-floating-button-label = Iruzkina
pdfjs-editor-signature-button =
    .title = Gehitu sinadura
pdfjs-editor-signature-button-label = Gehitu sinadura

## Default editor aria labels

# “Highlight” is a noun, the string is used on the editor for highlights.
pdfjs-editor-highlight-editor =
    .aria-label = Nabarmendutakoen editorea
# “Drawing” is a noun, the string is used on the editor for drawings.
pdfjs-editor-ink-editor =
    .aria-label = Marrazkien editorea
# Used when a signature editor is selected/hovered.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-signature-editor1 =
    .aria-description = Sinaduren editorea: { $description }
pdfjs-editor-stamp-editor =
    .aria-label = Irudien editorea

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Kendu marrazkia
pdfjs-editor-remove-freetext-button =
    .title = Kendu testua
pdfjs-editor-remove-stamp-button =
    .title = Kendu irudia
pdfjs-editor-remove-highlight-button =
    .title = Kendu nabarmentzea
pdfjs-editor-remove-signature-button =
    .title = Kendu sinadura

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Kolorea
pdfjs-editor-free-text-size-input = Tamaina
pdfjs-editor-ink-color-input = Kolorea
pdfjs-editor-ink-thickness-input = Loditasuna
pdfjs-editor-ink-opacity-input = Opakutasuna
pdfjs-editor-stamp-add-image-button =
    .title = Gehitu irudia
pdfjs-editor-stamp-add-image-button-label = Gehitu irudia
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Loditasuna
pdfjs-editor-free-highlight-thickness-title =
    .title = Aldatu loditasuna testua ez beste elementuak nabarmentzean
pdfjs-editor-add-signature-container =
    .aria-label = Sinaduren kontrolak eta gordetako sinadurak
pdfjs-editor-signature-add-signature-button =
    .title = Gehitu sinadura berria
pdfjs-editor-signature-add-signature-button-label = Gehitu sinadura berria
# Used on the button to use an already saved signature.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-add-saved-signature-button =
    .title = Gordetako sinadura: { $description }
# .default-content is used as a placeholder in an empty text editor.
pdfjs-free-text2 =
    .aria-label = Testu-editorea
    .default-content = Hasi idazten…

## Alt-text dialog

pdfjs-editor-alt-text-button-label = Testu alternatiboa
pdfjs-editor-alt-text-edit-button =
    .aria-label = Editatu testu alternatiboa
pdfjs-editor-alt-text-dialog-label = Aukeratu aukera
pdfjs-editor-alt-text-dialog-description = Testu alternatiboak laguntzen du jendeak ezin duenean irudia ikusi edo ez denean kargatzen.
pdfjs-editor-alt-text-add-description-label = Gehitu azalpena
pdfjs-editor-alt-text-add-description-description = Saiatu idazten gaia, ezarpena edo ekintzak deskribatzen dituen esaldi 1 edo 2.
pdfjs-editor-alt-text-mark-decorative-label = Markatu apaingarri gisa
pdfjs-editor-alt-text-mark-decorative-description = Irudiak apaingarrientzat erabiltzen da, adibidez ertz edo ur-marketarako.
pdfjs-editor-alt-text-cancel-button = Utzi
pdfjs-editor-alt-text-save-button = Gorde
pdfjs-editor-alt-text-decorative-tooltip = Apaingarri gisa markatuta
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Adibidez, "gizon gaztea mahaian eserita dago bazkaltzeko"
# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button =
    .aria-label = Testu alternatiboa

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-top-left =
    .aria-label = Goiko ezkerreko izkina — aldatu tamaina
pdfjs-editor-resizer-top-middle =
    .aria-label = Goian erdian — aldatu tamaina
pdfjs-editor-resizer-top-right =
    .aria-label = Goiko eskuineko izkina — aldatu tamaina
pdfjs-editor-resizer-middle-right =
    .aria-label = Erdian eskuinean — aldatu tamaina
pdfjs-editor-resizer-bottom-right =
    .aria-label = Beheko eskuineko izkina — aldatu tamaina
pdfjs-editor-resizer-bottom-middle =
    .aria-label = Behean erdian — aldatu tamaina
pdfjs-editor-resizer-bottom-left =
    .aria-label = Beheko ezkerreko izkina — aldatu tamaina
pdfjs-editor-resizer-middle-left =
    .aria-label = Erdian ezkerrean —  aldatu tamaina

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Nabarmentze kolorea
pdfjs-editor-colorpicker-button =
    .title = Aldatu kolorea
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Kolore-aukerak
pdfjs-editor-colorpicker-yellow =
    .title = Horia
pdfjs-editor-colorpicker-green =
    .title = Berdea
pdfjs-editor-colorpicker-blue =
    .title = Urdina
pdfjs-editor-colorpicker-pink =
    .title = Arrosa
pdfjs-editor-colorpicker-red =
    .title = Gorria

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Erakutsi denak
pdfjs-editor-highlight-show-all-button =
    .title = Erakutsi denak

## New alt-text dialog
## Group note for entire feature: Alternative text (alt text) helps when people can't see the image. This feature includes a tool to create alt text automatically using an AI model that works locally on the user's device to preserve privacy.

# Modal header positioned above a text box where users can edit the alt text.
pdfjs-editor-new-alt-text-dialog-edit-label = Editatu testu alternatiboa (irudiaren azalpena)
# Modal header positioned above a text box where users can add the alt text.
pdfjs-editor-new-alt-text-dialog-add-label = Gehitu testu alternatiboa (irudiaren azalpena)
pdfjs-editor-new-alt-text-textarea =
    .placeholder = Idatzi zure azalpena hemen…
# This text refers to the alt text box above this description. It offers a definition of alt text.
pdfjs-editor-new-alt-text-description = Azalpen laburra irudia ikusi ezin duen jendearentzat edo irudia kargatu ezin denerako.
# This is a required legal disclaimer that refers to the automatically created text inside the alt text box above this text. It disappears if the text is edited by a human.
pdfjs-editor-new-alt-text-disclaimer1 = Testu alternatibo hau automatikoki sortu da eta okerra izan liteke.
pdfjs-editor-new-alt-text-disclaimer-learn-more-url = Argibide gehiago
pdfjs-editor-new-alt-text-create-automatically-button-label = Sortu testu alternatiboa automatikoki
pdfjs-editor-new-alt-text-not-now-button = Une honetan ez
pdfjs-editor-new-alt-text-error-title = Ezin da testu alternatiboa automatikoki sortu
pdfjs-editor-new-alt-text-error-description = Idatzi zure testu alternatibo propioa edo saiatu berriro geroago.
pdfjs-editor-new-alt-text-error-close-button = Itxi
# Variables:
#   $totalSize (Number) - the total size (in MB) of the AI model.
#   $downloadedSize (Number) - the downloaded size (in MB) of the AI model.
pdfjs-editor-new-alt-text-ai-model-downloading-progress = Testu alternatiboaren AA modeloa deskargatzen ({ $totalSize }/{ $downloadedSize } MB)
    .aria-valuetext = Testu alternatiboaren AA modeloa deskargatzen ({ $totalSize }/{ $downloadedSize } MB)
# This is a button that users can click to edit the alt text they have already added.
pdfjs-editor-new-alt-text-added-button =
    .aria-label = Testu alternatiboa gehituta
pdfjs-editor-new-alt-text-added-button-label = Testu alternatiboa gehituta
# This is a button that users can click to open the alt text editor and add alt text when it is not present.
pdfjs-editor-new-alt-text-missing-button =
    .aria-label = Testu alternatiboa falta da
pdfjs-editor-new-alt-text-missing-button-label = Testu alternatiboa falta da
# This is a button that opens up the alt text modal where users should review the alt text that was automatically generated.
pdfjs-editor-new-alt-text-to-review-button =
    .aria-label = Berrikusi testu alternatiboa
pdfjs-editor-new-alt-text-to-review-button-label = Berrikusi testu alternatiboa
# "Created automatically" is a prefix that will be added to the beginning of any alt text that has been automatically generated. After the colon, the user will see/hear the actual alt text description. If the alt text has been edited by a human, this prefix will not appear.
# Variables:
#   $generatedAltText (String) - the generated alt-text.
pdfjs-editor-new-alt-text-generated-alt-text-with-disclaimer = Automatikoki sortua: { $generatedAltText }

## Image alt-text settings

pdfjs-image-alt-text-settings-button =
    .title = Irudiaren testu alternatiboaren ezarpenak
pdfjs-image-alt-text-settings-button-label = Irudiaren testu alternatiboaren ezarpenak
pdfjs-editor-alt-text-settings-dialog-label = Irudiaren testu alternatiboaren ezarpenak
pdfjs-editor-alt-text-settings-automatic-title = Testu alternatibo automatikoa
pdfjs-editor-alt-text-settings-create-model-button-label = Sortu testu alternatiboa automatikoki
pdfjs-editor-alt-text-settings-create-model-description = Azalpenak iradokitzen ditu irudia ikusi ezin duen jendearentzat edo irudia kargatu ezin denerako.
# Variables:
#   $totalSize (Number) - the total size (in MB) of the AI model.
pdfjs-editor-alt-text-settings-download-model-label = Testu alternatiboaren AA modeloa ({ $totalSize } MB)
pdfjs-editor-alt-text-settings-ai-model-description = Zure gailuan modu lokalean exekutatzen da eta zure datuak pribatu mantentzen dira. Testu alternatibo automatikorako beharrezkoa.
pdfjs-editor-alt-text-settings-delete-model-button = Ezabatu
pdfjs-editor-alt-text-settings-download-model-button = Deskargatu
pdfjs-editor-alt-text-settings-downloading-model-button = Deskargatzen…
pdfjs-editor-alt-text-settings-editor-title = Testu alternatiboaren editorea
pdfjs-editor-alt-text-settings-show-dialog-button-label = Erakutsi testu alternatiboa irudi bat gehitzean berehala
pdfjs-editor-alt-text-settings-show-dialog-description = Zure irudiek testu alternatiboa duela ziurtatzen laguntzen dizu.
pdfjs-editor-alt-text-settings-close-button = Itxi

## Accessibility labels (announced by screen readers) for objects added to the editor.

pdfjs-editor-highlight-added-alert = Nabarmentzea gehituta
pdfjs-editor-freetext-added-alert = Testua gehituta
pdfjs-editor-ink-added-alert = Marrazkia gehituta
pdfjs-editor-stamp-added-alert = Irudia gehituta
pdfjs-editor-signature-added-alert = Sinadura gehituta

## "Annotations removed" bar

pdfjs-editor-undo-bar-message-highlight = Nabarmentzea kenduta
pdfjs-editor-undo-bar-message-freetext = Testua kenduta
pdfjs-editor-undo-bar-message-ink = Marrazkia kenduta
pdfjs-editor-undo-bar-message-stamp = Irudia kenduta
pdfjs-editor-undo-bar-message-signature = Sinadura kenduta
# Variables:
#   $count (Number) - the number of removed annotations.
pdfjs-editor-undo-bar-message-multiple =
    { $count ->
        [one] Esku-ohar bat kenduta
       *[other] { $count } esku-ohar kenduta
    }
pdfjs-editor-undo-bar-undo-button =
    .title = Desegin
pdfjs-editor-undo-bar-undo-button-label = Desegin
pdfjs-editor-undo-bar-close-button =
    .title = Itxi
pdfjs-editor-undo-bar-close-button-label = Itxi

## Add a signature dialog

pdfjs-editor-add-signature-dialog-label =
    Leiho modal honek PDF dokumentu batera gehitzeko sinadurak
    sortzea ahalbidetzen dio erabiltzaileari. Erabiltzaileak izena edita
    dezake (testu alternatibo modura ere erabiltzen dena) eta sinadura
    gordetzeko aukera du gehiagotan erabili ahal izateko.
pdfjs-editor-add-signature-dialog-title = Gehitu sinadura

## Tab names

# Type is a verb (you can type your name as signature)
pdfjs-editor-add-signature-type-button = Idatzi
    .title = Idatzi
# Draw is a verb (you can draw your signature)
pdfjs-editor-add-signature-draw-button = Marraztu
    .title = Marraztu
pdfjs-editor-add-signature-image-button = Irudia
    .title = Irudia

## Tab panels

pdfjs-editor-add-signature-type-input =
    .aria-label = Idatzi zure sinadura
    .placeholder = Idatzi zure sinadura
pdfjs-editor-add-signature-draw-placeholder = Marraztu zure sinadura
pdfjs-editor-add-signature-draw-thickness-range-label = Loditasuna
# Variables:
#   $thickness (Number) - the thickness (in pixels) of the line used to draw a signature.
pdfjs-editor-add-signature-draw-thickness-range =
    .title = Marrazteko loditasuna: { $thickness }
pdfjs-editor-add-signature-image-placeholder = Igotzeko, jaregin fitxategia hemen
pdfjs-editor-add-signature-image-browse-link =
    { PLATFORM() ->
        [macos] Edo aukeratu irudi-fitxategiak
       *[other] Edo arakatu irudi-fitxategiak
    }

## Controls

pdfjs-editor-add-signature-description-label = Azalpena (testu alternatiboa)
pdfjs-editor-add-signature-description-input =
    .title = Azalpena (testu alternatiboa)
pdfjs-editor-add-signature-description-default-when-drawing = Sinadura
pdfjs-editor-add-signature-clear-button-label = Garbitu sinadura
pdfjs-editor-add-signature-clear-button =
    .title = Garbitu sinadura
pdfjs-editor-add-signature-save-checkbox = Gorde sinadura
pdfjs-editor-add-signature-save-warning-message = Gordetako sinadura kopuruaren mugara heldu zara (5). Gehiago gorde ahal izateko, ken ezazu bat.
pdfjs-editor-add-signature-image-upload-error-title = Ezin da irudia igo
pdfjs-editor-add-signature-image-upload-error-description = Egiaztatu zure sareko konexioa edo saiatu beste irudi batekin.
pdfjs-editor-add-signature-image-no-data-error-title = Ezin da irudia sinaduran bihurtu
pdfjs-editor-add-signature-image-no-data-error-description = Saiatu beste irudi bat igotzen.
pdfjs-editor-add-signature-error-close-button = Itxi

## Dialog buttons

pdfjs-editor-add-signature-cancel-button = Utzi
pdfjs-editor-add-signature-add-button = Gehitu
pdfjs-editor-edit-signature-update-button = Eguneratu

##  Edit a comment dialog

pdfjs-editor-edit-comment-actions-button-label = Ekintzak
pdfjs-editor-edit-comment-actions-button =
    .title = Ekintzak
pdfjs-editor-edit-comment-close-button-label = Itxi
pdfjs-editor-edit-comment-close-button =
    .title = Itxi
pdfjs-editor-edit-comment-actions-edit-button-label = Editatu
pdfjs-editor-edit-comment-actions-delete-button-label = Ezabatu
pdfjs-editor-edit-comment-manager-text-input =
    .placeholder = Idatzi zure iruzkina
pdfjs-editor-edit-comment-manager-cancel-button = Utzi
pdfjs-editor-edit-comment-manager-save-button = Gorde

## Edit a comment button in the editor toolbar

pdfjs-editor-edit-comment-button =
    .title = Editatu iruzkina

## Main menu for adding/removing signatures

pdfjs-editor-delete-signature-button1 =
    .title = Kendu gordetako sinadura
pdfjs-editor-delete-signature-button-label1 = Kendu gordetako sinadura

## Editor toolbar

pdfjs-editor-add-signature-edit-button-label = Editatu azalpena

## Edit signature description dialog

pdfjs-editor-edit-signature-dialog-title = Editatu azalpena
