# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Pàgina anterior
pdfjs-previous-button-label = Anterior
pdfjs-next-button =
    .title = Pàgina següent
pdfjs-next-button-label = Següent
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Pàgina
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = de { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } de { $pagesCount })
pdfjs-zoom-out-button =
    .title = Redueix
pdfjs-zoom-out-button-label = Redueix
pdfjs-zoom-in-button =
    .title = Amplia
pdfjs-zoom-in-button-label = Amplia
pdfjs-zoom-select =
    .title = Escala
pdfjs-presentation-mode-button =
    .title = Canvia al mode de presentació
pdfjs-presentation-mode-button-label = Mode de presentació
pdfjs-open-file-button =
    .title = Obre el fitxer
pdfjs-open-file-button-label = Obre
pdfjs-print-button =
    .title = Imprimeix
pdfjs-print-button-label = Imprimeix
pdfjs-save-button =
    .title = Desa
pdfjs-save-button-label = Desa
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Baixa
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Baixa
pdfjs-bookmark-button =
    .title = Pàgina actual (mostra l'URL de la pàgina actual)
pdfjs-bookmark-button-label = Pàgina actual

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Eines
pdfjs-tools-button-label = Eines
pdfjs-first-page-button =
    .title = Vés a la primera pàgina
pdfjs-first-page-button-label = Vés a la primera pàgina
pdfjs-last-page-button =
    .title = Vés a l'última pàgina
pdfjs-last-page-button-label = Vés a l'última pàgina
pdfjs-page-rotate-cw-button =
    .title = Gira cap a la dreta
pdfjs-page-rotate-cw-button-label = Gira cap a la dreta
pdfjs-page-rotate-ccw-button =
    .title = Gira cap a l'esquerra
pdfjs-page-rotate-ccw-button-label = Gira cap a l'esquerra
pdfjs-cursor-text-select-tool-button =
    .title = Habilita l'eina de selecció de text
pdfjs-cursor-text-select-tool-button-label = Eina de selecció de text
pdfjs-cursor-hand-tool-button =
    .title = Habilita l'eina de mà
pdfjs-cursor-hand-tool-button-label = Eina de mà
pdfjs-scroll-page-button =
    .title = Usa el desplaçament de pàgina
pdfjs-scroll-page-button-label = Desplaçament de pàgina
pdfjs-scroll-vertical-button =
    .title = Utilitza el desplaçament vertical
pdfjs-scroll-vertical-button-label = Desplaçament vertical
pdfjs-scroll-horizontal-button =
    .title = Utilitza el desplaçament horitzontal
pdfjs-scroll-horizontal-button-label = Desplaçament horitzontal
pdfjs-scroll-wrapped-button =
    .title = Activa el desplaçament continu
pdfjs-scroll-wrapped-button-label = Desplaçament continu
pdfjs-spread-none-button =
    .title = No agrupis les pàgines de dues en dues
pdfjs-spread-none-button-label = Una sola pàgina
pdfjs-spread-odd-button =
    .title = Mostra dues pàgines començant per les pàgines de numeració senar
pdfjs-spread-odd-button-label = Doble pàgina (senar)
pdfjs-spread-even-button =
    .title = Mostra dues pàgines començant per les pàgines de numeració parell
pdfjs-spread-even-button-label = Doble pàgina (parell)

## Document properties dialog

pdfjs-document-properties-button =
    .title = Propietats del document…
pdfjs-document-properties-button-label = Propietats del document…
pdfjs-document-properties-file-name = Nom del fitxer:
pdfjs-document-properties-file-size = Mida del fitxer:
# Variables:
#   $kb (Number) - the PDF file size in kilobytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-kb = { NUMBER($kb, maximumSignificantDigits: 3) } kB ({ $b } bytes)
# Variables:
#   $mb (Number) - the PDF file size in megabytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-mb = { NUMBER($mb, maximumSignificantDigits: 3) } MB ({ $b } bytes)
pdfjs-document-properties-title = Títol:
pdfjs-document-properties-author = Autor:
pdfjs-document-properties-subject = Assumpte:
pdfjs-document-properties-keywords = Paraules clau:
pdfjs-document-properties-creation-date = Data de creació:
pdfjs-document-properties-modification-date = Data de modificació:
pdfjs-document-properties-creator = Creador:
pdfjs-document-properties-producer = Generador de PDF:
pdfjs-document-properties-version = Versió de PDF:
pdfjs-document-properties-page-count = Nombre de pàgines:
pdfjs-document-properties-page-size = Mida de la pàgina:
pdfjs-document-properties-page-size-unit-inches = polzades
pdfjs-document-properties-page-size-unit-millimeters = mm
pdfjs-document-properties-page-size-orientation-portrait = vertical
pdfjs-document-properties-page-size-orientation-landscape = apaïsat
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = Carta
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
pdfjs-document-properties-linearized = Vista web ràpida:
pdfjs-document-properties-linearized-yes = Sí
pdfjs-document-properties-linearized-no = No
pdfjs-document-properties-close-button = Tanca
pdfjs-digital-signature-properties-view-certificate = Mostra el certificat
# Shown beneath an invalid signature card to explain why verification
# failed. The text comes from NSS (e.g. "Signature integrity has been
# compromised", "PKCS#7 signature could not be parsed") and is not
# itself localized — it is the underlying error message produced by
# the verification backend.
# Variables:
#   $reason (String) - error message describing why the signature
#                      could not be verified.
pdfjs-digital-signature-properties-reason = Motiu: { $reason }
# Variables:
#   $count (Number) - number of nested sub-signatures (one per earlier
#                     incremental revision of the document).
pdfjs-digital-signature-properties-sub-signatures =
    { $count ->
        [one] Una subsignatura
       *[other] ({ $count }) subsignatures
    }

## Print

pdfjs-print-progress-message = S'està preparant la impressió del document…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Cancel·la
pdfjs-printing-not-supported = Avís: la impressió no és plenament funcional en aquest navegador.
pdfjs-printing-not-ready = Atenció: el PDF no s'ha acabat de carregar per imprimir-lo.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Mostra/amaga la barra lateral
pdfjs-toggle-sidebar-notification-button =
    .title = Mostra/amaga la barra lateral (el document conté un esquema, adjuncions o capes)
pdfjs-toggle-sidebar-button-label = Mostra/amaga la barra lateral
pdfjs-document-outline-button =
    .title = Mostra l'esquema del document (doble clic per ampliar/reduir tots els elements)
pdfjs-document-outline-button-label = Esquema del document
pdfjs-attachments-button =
    .title = Mostra les adjuncions
pdfjs-attachments-button-label = Adjuncions
pdfjs-layers-button =
    .title = Mostra les capes (doble clic per restablir totes les capes al seu estat per defecte)
pdfjs-layers-button-label = Capes
pdfjs-thumbs-button =
    .title = Mostra les miniatures
pdfjs-thumbs-button-label = Miniatures
pdfjs-current-outline-item-button =
    .title = Cerca l'element d'esquema actual
pdfjs-current-outline-item-button-label = Element d'esquema actual
pdfjs-findbar-button =
    .title = Cerca al document
pdfjs-findbar-button-label = Cerca
pdfjs-additional-layers = Capes addicionals

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Pàgina { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Miniatura de la pàgina { $page }
# Variables:
#   $page (Number) - the page number
#   $total (Number) - the number of pages
pdfjs-thumb-page-title1 =
    .title = Pàgina { $page } de { $total }

## Find panel button title and messages

pdfjs-find-input =
    .title = Cerca
    .placeholder = Cerca al document…
pdfjs-find-previous-button =
    .title = Cerca l'anterior coincidència de l'expressió
pdfjs-find-previous-button-label = Anterior
pdfjs-find-next-button =
    .title = Cerca la següent coincidència de l'expressió
pdfjs-find-next-button-label = Següent
pdfjs-find-highlight-checkbox = Ressalta-ho tot
pdfjs-find-match-case-checkbox-label = Distingeix entre majúscules i minúscules
pdfjs-find-match-diacritics-checkbox-label = Respecta els diacrítics
pdfjs-find-entire-word-checkbox-label = Paraules senceres
pdfjs-find-reached-top = S'ha arribat al principi del document, es continua pel final
pdfjs-find-reached-bottom = S'ha arribat al final del document, es continua pel principi
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } d'{ $total } coincidència
       *[other] { $current } de { $total } coincidències
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Més d'{ $limit } coincidència
       *[other] Més de { $limit } coincidències
    }
pdfjs-find-not-found = No s'ha trobat l'expressió

## Predefined zoom values

pdfjs-page-scale-width = Amplada de la pàgina
pdfjs-page-scale-fit = Ajusta la pàgina
pdfjs-page-scale-auto = Zoom automàtic
pdfjs-page-scale-actual = Mida real
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Pàgina { $page }

## Loading indicator messages

pdfjs-loading-error = S'ha produït un error en carregar el PDF.
pdfjs-invalid-file-error = El fitxer PDF no és vàlid o està malmès.
pdfjs-missing-file-error = Falta el fitxer PDF.
pdfjs-unexpected-response-error = Resposta inesperada del servidor.
pdfjs-rendering-error = S'ha produït un error mentre es renderitzava la pàgina.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [Anotació { $type }]

## Password

pdfjs-password-label = Introduïu la contrasenya per obrir aquest fitxer PDF.
pdfjs-password-invalid = La contrasenya no és vàlida. Torneu-ho a provar.
pdfjs-password-ok-button = D'acord
pdfjs-password-cancel-button = Cancel·la
pdfjs-web-fonts-disabled = Els tipus de lletra web estan desactivats: no es poden utilitzar els tipus de lletra incrustats al PDF.

## Editing

pdfjs-editor-free-text-button =
    .title = Text
pdfjs-editor-color-picker-free-text-input =
    .title = Canvia el color del text
pdfjs-editor-free-text-button-label = Text
pdfjs-editor-ink-button =
    .title = Dibuixa
pdfjs-editor-color-picker-ink-input =
    .title = Canvia el color de dibuix
pdfjs-editor-ink-button-label = Dibuixa
pdfjs-editor-stamp-button =
    .title = Afegeix o edita imatges
pdfjs-editor-stamp-button-label = Afegeix o edita imatges
pdfjs-editor-highlight-button =
    .title = Ressalta
pdfjs-editor-highlight-button-label = Ressalta
pdfjs-highlight-floating-button1 =
    .title = Ressalta
    .aria-label = Ressalta
pdfjs-highlight-floating-button-label = Ressalta
pdfjs-editor-signature-button =
    .title = Afegeix una signatura
pdfjs-editor-signature-button-label = Afegeix una signatura

## Default editor aria labels

# “Drawing” is a noun, the string is used on the editor for drawings.
pdfjs-editor-ink-editor =
    .aria-label = Editor de dibuix
# Used when a signature editor is selected/hovered.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-signature-editor1 =
    .aria-description = Editor de signatures: { $description }
pdfjs-editor-stamp-editor =
    .aria-label = Editor d'imatges

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Suprimeix el dibuix
pdfjs-editor-remove-freetext-button =
    .title = Suprimeix el text
pdfjs-editor-remove-stamp-button =
    .title = Suprimeix la imatge
pdfjs-editor-remove-highlight-button =
    .title = Suprimeix el ressaltat
pdfjs-editor-remove-signature-button =
    .title = Elimina la signatura

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Color
pdfjs-editor-free-text-size-input = Mida
pdfjs-editor-ink-color-input = Color
pdfjs-editor-ink-thickness-input = Gruix
pdfjs-editor-ink-opacity-input = Opacitat
pdfjs-editor-stamp-add-image-button =
    .title = Afegeix una imatge
pdfjs-editor-stamp-add-image-button-label = Afegeix una imatge
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Gruix
pdfjs-editor-add-signature-container =
    .aria-label = Controls de signatura i signatures desades
pdfjs-editor-signature-add-signature-button =
    .title = Afegeix una nova signatura
pdfjs-editor-signature-add-signature-button-label = Afegeix una nova signatura
# Used on the button to use an already saved signature.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-add-saved-signature-button =
    .title = Signatura desada: { $description }
# .default-content is used as a placeholder in an empty text editor.
pdfjs-free-text2 =
    .aria-label = Editor de text
    .default-content = Comença a escriute...
# Used to show how many comments are present in the pdf file.
# Variables:
#   $count (Number) - the number of comments.
pdfjs-editor-comments-sidebar-title =
    { $count ->
        [one] Comentari
       *[other] Comentaris
    }
pdfjs-editor-comments-sidebar-close-button =
    .title = Tanca la barra lateral
    .aria-label = Tanca la barra lateral
pdfjs-editor-comments-sidebar-close-button-label = Tanca la barra lateral
pdfjs-editor-comments-sidebar-no-comments-link = Més informació

## Alt-text dialog

pdfjs-editor-alt-text-button-label = Text alternatiu
pdfjs-editor-alt-text-edit-button =
    .aria-label = Edita el text alternatiu
pdfjs-editor-alt-text-dialog-label = Trieu una opció
pdfjs-editor-alt-text-dialog-description = El text alternatiu és d'ajuda quan no es pot veure la imatge o quan no es carrega.
pdfjs-editor-alt-text-add-description-label = Afegeix una descripció
pdfjs-editor-alt-text-add-description-description = Una o dues frases amb la intenció de descriure el subjecte, l'entorn o les accions.
pdfjs-editor-alt-text-mark-decorative-label = Marca com a decoratiu
pdfjs-editor-alt-text-mark-decorative-description = Això s'utilitza per a imatges ornamentals, com ara vores o marques d'aigua.
pdfjs-editor-alt-text-cancel-button = Cancel·la
pdfjs-editor-alt-text-save-button = Desa
pdfjs-editor-alt-text-decorative-tooltip = S'ha marcat com a decoratiu
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Per exemple, “Un jove seu a taula per menjar un àpat”
# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button =
    .aria-label = Text alternatiu

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Color de ressaltat
pdfjs-editor-colorpicker-button =
    .title = Canvia el color
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Opcions de color
pdfjs-editor-colorpicker-yellow =
    .title = Groc
pdfjs-editor-colorpicker-green =
    .title = Verd
pdfjs-editor-colorpicker-blue =
    .title = Blau
pdfjs-editor-colorpicker-pink =
    .title = Rosa
pdfjs-editor-colorpicker-red =
    .title = Vermell

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Mostra-ho tot
pdfjs-editor-highlight-show-all-button =
    .title = Mostra-ho tot

## New alt-text dialog
## Group note for entire feature: Alternative text (alt text) helps when people can't see the image. This feature includes a tool to create alt text automatically using an AI model that works locally on the user's device to preserve privacy.

# Modal header positioned above a text box where users can edit the alt text.
pdfjs-editor-new-alt-text-dialog-edit-label = Edita el text alternatiu (descripció de la imatge)
# Modal header positioned above a text box where users can add the alt text.
pdfjs-editor-new-alt-text-dialog-add-label = Afegeix text alternatiu (descripció de la imatge)
pdfjs-editor-new-alt-text-textarea =
    .placeholder = Escriviu la vostra descripció aquí...
# This text refers to the alt text box above this description. It offers a definition of alt text.
pdfjs-editor-new-alt-text-description = Descripció breu per a les persones que no poden veure la imatge o quan la imatge no es carrega.
# This is a required legal disclaimer that refers to the automatically created text inside the alt text box above this text. It disappears if the text is edited by a human.
pdfjs-editor-new-alt-text-disclaimer1 = Aquest text alternatiu ha estat creat automàticament i pot ser inexacte.
pdfjs-editor-new-alt-text-disclaimer-learn-more-url = Més informació
pdfjs-editor-new-alt-text-create-automatically-button-label = Crea el text alternatiu automàticament
pdfjs-editor-new-alt-text-not-now-button = Ara no
pdfjs-editor-new-alt-text-error-title = No s'ha pogut crear el text alternatiu automàticament
pdfjs-editor-new-alt-text-error-description = Escriviu el vostre propi text alternatiu o proveu més tard.
pdfjs-editor-new-alt-text-error-close-button = Tanca
# This is a button that users can click to edit the alt text they have already added.
pdfjs-editor-new-alt-text-added-button =
    .aria-label = Text alternatiu afegit.
pdfjs-editor-new-alt-text-added-button-label = Text alternatiu afegit.

## Image alt-text settings

pdfjs-editor-alt-text-settings-delete-model-button = Suprimeix
pdfjs-editor-alt-text-settings-download-model-button = Baixa
pdfjs-editor-alt-text-settings-downloading-model-button = S'està descarregant…
pdfjs-editor-alt-text-settings-close-button = Tanca

## "Annotations removed" bar

pdfjs-editor-undo-bar-message-ink = S'ha eliminat el dibuix
pdfjs-editor-undo-bar-message-stamp = S'ha eliminat la imatge
pdfjs-editor-undo-bar-message-signature = S’ha eliminat la signatura
# Variables:
#   $count (Number) - the number of removed annotations.
pdfjs-editor-undo-bar-message-multiple =
    { $count ->
        [one] S'ha eliminat una anotació
       *[other] S'han eliminat { $count } anotacions
    }
pdfjs-editor-undo-bar-undo-button =
    .title = Desfés
pdfjs-editor-undo-bar-undo-button-label = Desfés
pdfjs-editor-undo-bar-close-button =
    .title = Tanca
pdfjs-editor-undo-bar-close-button-label = Tanca

## Dialog buttons

pdfjs-editor-add-signature-cancel-button = Cancel·la
