# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = Папярэдняя старонка
pdfjs-previous-button-label = Папярэдняя
pdfjs-next-button =
    .title = Наступная старонка
pdfjs-next-button-label = Наступная
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = Старонка
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = з { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } з { $pagesCount })
pdfjs-zoom-out-button =
    .title = Паменшыць
pdfjs-zoom-out-button-label = Паменшыць
pdfjs-zoom-in-button =
    .title = Павялічыць
pdfjs-zoom-in-button-label = Павялічыць
pdfjs-zoom-select =
    .title = Павялічэнне тэксту
pdfjs-presentation-mode-button =
    .title = Пераключыцца ў рэжым паказу
pdfjs-presentation-mode-button-label = Рэжым паказу
pdfjs-open-file-button =
    .title = Адкрыць файл
pdfjs-open-file-button-label = Адкрыць
pdfjs-print-button =
    .title = Друкаваць
pdfjs-print-button-label = Друкаваць
pdfjs-save-button =
    .title = Захаваць
pdfjs-save-button-label = Захаваць
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = Сцягнуць
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = Сцягнуць
pdfjs-bookmark-button =
    .title = Дзейная старонка (паглядзець URL-адрас з дзейнай старонкі)
pdfjs-bookmark-button-label = Цяперашняя старонка

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = Прылады
pdfjs-tools-button-label = Прылады
pdfjs-first-page-button =
    .title = Перайсці на першую старонку
pdfjs-first-page-button-label = Перайсці на першую старонку
pdfjs-last-page-button =
    .title = Перайсці на апошнюю старонку
pdfjs-last-page-button-label = Перайсці на апошнюю старонку
pdfjs-page-rotate-cw-button =
    .title = Павярнуць па сонцу
pdfjs-page-rotate-cw-button-label = Павярнуць па сонцу
pdfjs-page-rotate-ccw-button =
    .title = Павярнуць супраць сонца
pdfjs-page-rotate-ccw-button-label = Павярнуць супраць сонца
pdfjs-cursor-text-select-tool-button =
    .title = Уключыць прыладу выбару тэксту
pdfjs-cursor-text-select-tool-button-label = Прылада выбару тэксту
pdfjs-cursor-hand-tool-button =
    .title = Уключыць ручную прыладу
pdfjs-cursor-hand-tool-button-label = Ручная прылада
pdfjs-scroll-page-button =
    .title = Выкарыстоўваць пракрутку старонкi
pdfjs-scroll-page-button-label = Пракрутка старонкi
pdfjs-scroll-vertical-button =
    .title = Ужываць вертыкальную пракрутку
pdfjs-scroll-vertical-button-label = Вертыкальная пракрутка
pdfjs-scroll-horizontal-button =
    .title = Ужываць гарызантальную пракрутку
pdfjs-scroll-horizontal-button-label = Гарызантальная пракрутка
pdfjs-scroll-wrapped-button =
    .title = Ужываць маштабавальную пракрутку
pdfjs-scroll-wrapped-button-label = Маштабавальная пракрутка
pdfjs-spread-none-button =
    .title = Не выкарыстоўваць разгорнутыя старонкі
pdfjs-spread-none-button-label = Без разгорнутых старонак
pdfjs-spread-odd-button =
    .title = Разгорнутыя старонкі пачынаючы з няцотных нумароў
pdfjs-spread-odd-button-label = Няцотныя старонкі злева
pdfjs-spread-even-button =
    .title = Разгорнутыя старонкі пачынаючы з цотных нумароў
pdfjs-spread-even-button-label = Цотныя старонкі злева

## Document properties dialog

pdfjs-document-properties-button =
    .title = Уласцівасці дакумента…
pdfjs-document-properties-button-label = Уласцівасці дакумента…
pdfjs-document-properties-file-name = Назва файла:
pdfjs-document-properties-file-size = Памер файла:
# Variables:
#   $kb (Number) - the PDF file size in kilobytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-kb = { NUMBER($kb, maximumSignificantDigits: 3) } КБ ({ $b } байтаў)
# Variables:
#   $mb (Number) - the PDF file size in megabytes
#   $b (Number) - the PDF file size in bytes
pdfjs-document-properties-size-mb = { NUMBER($mb, maximumSignificantDigits: 3) } МБ ({ $b } байтаў)
pdfjs-document-properties-title = Загаловак:
pdfjs-document-properties-author = Аўтар:
pdfjs-document-properties-subject = Тэма:
pdfjs-document-properties-keywords = Ключавыя словы:
pdfjs-document-properties-creation-date = Дата стварэння:
pdfjs-document-properties-modification-date = Дата змянення:
# Variables:
#   $dateObj (Date) - the creation/modification date and time of the PDF file
pdfjs-document-properties-date-time-string = { DATETIME($dateObj, dateStyle: "short", timeStyle: "medium") }
pdfjs-document-properties-creator = Стваральнік:
pdfjs-document-properties-producer = Вырабнік PDF:
pdfjs-document-properties-version = Версія PDF:
pdfjs-document-properties-page-count = Колькасць старонак:
pdfjs-document-properties-page-size = Памер старонкі:
pdfjs-document-properties-page-size-unit-inches = цаляў
pdfjs-document-properties-page-size-unit-millimeters = мм
pdfjs-document-properties-page-size-orientation-portrait = кніжная
pdfjs-document-properties-page-size-orientation-landscape = альбомная
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
pdfjs-document-properties-linearized = Хуткі прагляд у Інтэрнэце:
pdfjs-document-properties-linearized-yes = Так
pdfjs-document-properties-linearized-no = Не
pdfjs-document-properties-close-button = Закрыць

## Print

pdfjs-print-progress-message = Падрыхтоўка дакумента да друку…
# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = Скасаваць
pdfjs-printing-not-supported = Папярэджанне: друк не падтрымліваецца цалкам гэтым браўзерам.
pdfjs-printing-not-ready = Увага: PDF не сцягнуты цалкам для друкавання.

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = Паказаць/схаваць бакавую панэль
pdfjs-toggle-sidebar-notification-button =
    .title = Паказаць/схаваць бакавую панэль (дакумент мае змест/укладанні/пласты)
pdfjs-toggle-sidebar-button-label = Паказаць/схаваць бакавую панэль
pdfjs-document-outline-button =
    .title = Паказаць структуру дакумента (двайная пстрычка, каб разгарнуць /згарнуць усе элементы)
pdfjs-document-outline-button-label = Структура дакумента
pdfjs-attachments-button =
    .title = Паказаць далучэнні
pdfjs-attachments-button-label = Далучэнні
pdfjs-layers-button =
    .title = Паказаць пласты (націсніце двойчы, каб скінуць усе пласты да прадвызначанага стану)
pdfjs-layers-button-label = Пласты
pdfjs-thumbs-button =
    .title = Паказ мініяцюр
pdfjs-thumbs-button-label = Мініяцюры
pdfjs-current-outline-item-button =
    .title = Знайсці бягучы элемент структуры
pdfjs-current-outline-item-button-label = Бягучы элемент структуры
pdfjs-findbar-button =
    .title = Пошук у дакуменце
pdfjs-findbar-button-label = Знайсці
pdfjs-additional-layers = Дадатковыя пласты

## Thumbnails panel item (tooltip and alt text for images)

# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-title =
    .title = Старонка { $page }
# Variables:
#   $page (Number) - the page number
pdfjs-thumb-page-canvas =
    .aria-label = Мініяцюра старонкі { $page }

## Find panel button title and messages

pdfjs-find-input =
    .title = Шукаць
    .placeholder = Шукаць у дакуменце…
pdfjs-find-previous-button =
    .title = Знайсці папярэдні выпадак выразу
pdfjs-find-previous-button-label = Папярэдні
pdfjs-find-next-button =
    .title = Знайсці наступны выпадак выразу
pdfjs-find-next-button-label = Наступны
pdfjs-find-highlight-checkbox = Падфарбаваць усе
pdfjs-find-match-case-checkbox-label = Адрозніваць вялікія/малыя літары
pdfjs-find-match-diacritics-checkbox-label = З улікам дыякрытык
pdfjs-find-entire-word-checkbox-label = Словы цалкам
pdfjs-find-reached-top = Дасягнуты пачатак дакумента, працяг з канца
pdfjs-find-reached-bottom = Дасягнуты канец дакумента, працяг з пачатку
# Variables:
#   $current (Number) - the index of the currently active find result
#   $total (Number) - the total number of matches in the document
pdfjs-find-match-count =
    { $total ->
        [one] { $current } з { $total } супадзенняў
        [few] { $current } з { $total } супадзенняў
       *[many] { $current } з { $total } супадзенняў
    }
# Variables:
#   $limit (Number) - the maximum number of matches
pdfjs-find-match-count-limit =
    { $limit ->
        [one] Больш за { $limit } супадзенне
        [few] Больш за { $limit } супадзенні
       *[many] Больш за { $limit } супадзенняў
    }
pdfjs-find-not-found = Выраз не знойдзены

## Predefined zoom values

pdfjs-page-scale-width = Шырыня старонкі
pdfjs-page-scale-fit = Уцісненне старонкі
pdfjs-page-scale-auto = Аўтаматычнае павелічэнне
pdfjs-page-scale-actual = Сапраўдны памер
# Variables:
#   $scale (Number) - percent value for page scale
pdfjs-page-scale-percent = { $scale }%

## PDF page

# Variables:
#   $page (Number) - the page number
pdfjs-page-landmark =
    .aria-label = Старонка { $page }

## Loading indicator messages

pdfjs-loading-error = Здарылася памылка ў часе загрузкі PDF.
pdfjs-invalid-file-error = Няспраўны або пашкоджаны файл PDF.
pdfjs-missing-file-error = Адсутны файл PDF.
pdfjs-unexpected-response-error = Нечаканы адказ сервера.
pdfjs-rendering-error = Здарылася памылка падчас адлюстравання старонкі.

## Annotations

# .alt: This is used as a tooltip.
# Variables:
#   $type (String) - an annotation type from a list defined in the PDF spec
# (32000-1:2008 Table 169 – Annotation types).
# Some common types are e.g.: "Check", "Text", "Comment", "Note"
pdfjs-text-annotation-type =
    .alt = [{ $type } Annotation]
# Variables:
#   $dateObj (Date) - the modification date and time of the annotation
pdfjs-annotation-date-time-string = { DATETIME($dateObj, dateStyle: "short", timeStyle: "medium") }

## Password

pdfjs-password-label = Увядзіце пароль, каб адкрыць гэты файл PDF.
pdfjs-password-invalid = Нядзейсны пароль. Паспрабуйце зноў.
pdfjs-password-ok-button = Добра
pdfjs-password-cancel-button = Скасаваць
pdfjs-web-fonts-disabled = Шрыфты Сеціва забаронены: немагчыма ўжываць укладзеныя шрыфты PDF.

## Editing

pdfjs-editor-free-text-button =
    .title = Тэкст
pdfjs-editor-color-picker-free-text-input =
    .title = Змяніць колер тэксту
pdfjs-editor-free-text-button-label = Тэкст
pdfjs-editor-ink-button =
    .title = Маляваць
pdfjs-editor-color-picker-ink-input =
    .title = Змяніць колер малюнка
pdfjs-editor-ink-button-label = Маляваць
pdfjs-editor-stamp-button =
    .title = Дадаць або змяніць выявы
pdfjs-editor-stamp-button-label = Дадаць або змяніць выявы
pdfjs-editor-highlight-button =
    .title = Вылучэнне
pdfjs-editor-highlight-button-label = Вылучэнне
pdfjs-highlight-floating-button1 =
    .title = Падфарбаваць
    .aria-label = Падфарбаваць
pdfjs-highlight-floating-button-label = Падфарбаваць
pdfjs-comment-floating-button =
    .title = Каментаваць
    .aria-label = Каментаваць
pdfjs-comment-floating-button-label = Каментаваць
pdfjs-editor-comment-button =
    .title = Каментарый
    .aria-label = Каментарый
pdfjs-editor-comment-button-label = Каментарый
pdfjs-editor-signature-button =
    .title = Дадаць подпіс
pdfjs-editor-signature-button-label = Дадаць подпіс

## Default editor aria labels

# “Highlight” is a noun, the string is used on the editor for highlights.
pdfjs-editor-highlight-editor =
    .aria-label = Рэдактар вылучэнняў
# “Drawing” is a noun, the string is used on the editor for drawings.
pdfjs-editor-ink-editor =
    .aria-label = Рэдактар малюнкаў
# Used when a signature editor is selected/hovered.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-signature-editor1 =
    .aria-description = Рэдактар подпісаў: { $description }
pdfjs-editor-stamp-editor =
    .aria-label = Рэдактар выяў

## Remove button for the various kind of editor.

pdfjs-editor-remove-ink-button =
    .title = Выдаліць малюнак
pdfjs-editor-remove-freetext-button =
    .title = Выдаліць тэкст
pdfjs-editor-remove-stamp-button =
    .title = Выдаліць выяву
pdfjs-editor-remove-highlight-button =
    .title = Выдаліць падфарбоўку
pdfjs-editor-remove-signature-button =
    .title = Выдаліць подпіс

##

# Editor Parameters
pdfjs-editor-free-text-color-input = Колер
pdfjs-editor-free-text-size-input = Памер
pdfjs-editor-ink-color-input = Колер
pdfjs-editor-ink-thickness-input = Таўшчыня
pdfjs-editor-ink-opacity-input = Непразрыстасць
pdfjs-editor-stamp-add-image-button =
    .title = Дадаць выяву
pdfjs-editor-stamp-add-image-button-label = Дадаць выяву
# This refers to the thickness of the line used for free highlighting (not bound to text)
pdfjs-editor-free-highlight-thickness-input = Таўшчыня
pdfjs-editor-free-highlight-thickness-title =
    .title = Змяняць таўшчыню пры вылучэнні іншых элементаў, акрамя тэксту
pdfjs-editor-add-signature-container =
    .aria-label = Элементы кіравання подпісамі і захаваныя подпісы
pdfjs-editor-signature-add-signature-button =
    .title = Дадаць новы подпіс
pdfjs-editor-signature-add-signature-button-label = Дадаць новы подпіс
# Used on the button to use an already saved signature.
# Variables:
#   $description (String) - a string describing/labeling the signature.
pdfjs-editor-add-saved-signature-button =
    .title = Захаваны подпіс: { $description }
# .default-content is used as a placeholder in an empty text editor.
pdfjs-free-text2 =
    .aria-label = Тэкставы рэдактар
    .default-content = Пачніце ўводзіць…
# Used to show how many comments are present in the pdf file.
# Variables:
#   $count (Number) - the number of comments.
pdfjs-editor-comments-sidebar-title =
    { $count ->
        [one] Каментарый
        [few] Каментарыі
       *[many] Каментарыі
    }
pdfjs-editor-comments-sidebar-close-button =
    .title = Закрыць бакавую панэль
    .aria-label = Закрыць бакавую панэль
pdfjs-editor-comments-sidebar-close-button-label = Закрыць бакавую панэль
# Instructional copy to add a comment by selecting text or an annotations.
pdfjs-editor-comments-sidebar-no-comments1 = Бачыце штосьці вартае ўвагі? Вылучыце і пакіньце каментарый.
pdfjs-editor-comments-sidebar-no-comments-link = Падрабязней

## Alt-text dialog

pdfjs-editor-alt-text-button-label = Альтэрнатыўны тэкст
pdfjs-editor-alt-text-edit-button =
    .aria-label = Змяніць альтэрнатыўны тэкст
pdfjs-editor-alt-text-dialog-label = Выберыце варыянт
pdfjs-editor-alt-text-dialog-description = Альтэрнатыўны тэкст дапамагае, калі людзі не бачаць выяву або калі яна не загружаецца.
pdfjs-editor-alt-text-add-description-label = Дадаць апісанне
pdfjs-editor-alt-text-add-description-description = Старайцеся скласці 1-2 сказы, якія апісваюць прадмет, абстаноўку або дзеянні.
pdfjs-editor-alt-text-mark-decorative-label = Пазначыць як дэкаратыўны
pdfjs-editor-alt-text-mark-decorative-description = Выкарыстоўваецца для дэкаратыўных выяваў, такіх як рамкі або вадзяныя знакі.
pdfjs-editor-alt-text-cancel-button = Скасаваць
pdfjs-editor-alt-text-save-button = Захаваць
pdfjs-editor-alt-text-decorative-tooltip = Пазначаны як дэкаратыўны
# .placeholder: This is a placeholder for the alt text input area
pdfjs-editor-alt-text-textarea =
    .placeholder = Напрыклад, «Малады чалавек садзіцца за стол есці»
# Alternative text (alt text) helps when people can't see the image.
pdfjs-editor-alt-text-button =
    .aria-label = Альтэрнатыўны тэкст

## Editor resizers
## This is used in an aria label to help to understand the role of the resizer.

pdfjs-editor-resizer-top-left =
    .aria-label = Верхні левы кут — змяніць памер
pdfjs-editor-resizer-top-middle =
    .aria-label = Уверсе пасярэдзіне — змяніць памер
pdfjs-editor-resizer-top-right =
    .aria-label = Верхні правы кут — змяніць памер
pdfjs-editor-resizer-middle-right =
    .aria-label = Пасярэдзіне справа — змяніць памер
pdfjs-editor-resizer-bottom-right =
    .aria-label = Правы ніжні кут — змяніць памер
pdfjs-editor-resizer-bottom-middle =
    .aria-label = Пасярэдзіне ўнізе — змяніць памер
pdfjs-editor-resizer-bottom-left =
    .aria-label = Левы ніжні кут — змяніць памер
pdfjs-editor-resizer-middle-left =
    .aria-label = Пасярэдзіне злева — змяніць памер

## Color picker

# This means "Color used to highlight text"
pdfjs-editor-highlight-colorpicker-label = Колер падфарбоўкі
pdfjs-editor-colorpicker-button =
    .title = Змяніць колер
pdfjs-editor-colorpicker-dropdown =
    .aria-label = Выбар колеру
pdfjs-editor-colorpicker-yellow =
    .title = Жоўты
pdfjs-editor-colorpicker-green =
    .title = Зялёны
pdfjs-editor-colorpicker-blue =
    .title = Блакітны
pdfjs-editor-colorpicker-pink =
    .title = Ружовы
pdfjs-editor-colorpicker-red =
    .title = Чырвоны

## Show all highlights
## This is a toggle button to show/hide all the highlights.

pdfjs-editor-highlight-show-all-button-label = Паказаць усе
pdfjs-editor-highlight-show-all-button =
    .title = Паказаць усе

## New alt-text dialog
## Group note for entire feature: Alternative text (alt text) helps when people can't see the image. This feature includes a tool to create alt text automatically using an AI model that works locally on the user's device to preserve privacy.

# Modal header positioned above a text box where users can edit the alt text.
pdfjs-editor-new-alt-text-dialog-edit-label = Рэдагаваць тэкст для атрыбута alt (апісанне выявы)
# Modal header positioned above a text box where users can add the alt text.
pdfjs-editor-new-alt-text-dialog-add-label = Дадаць тэкст для атрыбута alt (апісанне выявы)
pdfjs-editor-new-alt-text-textarea =
    .placeholder = Напішыце сваё апісанне тут…
# This text refers to the alt text box above this description. It offers a definition of alt text.
pdfjs-editor-new-alt-text-description = Кароткае апісанне для людзей, якія не бачаць выяву, ці калі выява не загружаецца.
# This is a required legal disclaimer that refers to the automatically created text inside the alt text box above this text. It disappears if the text is edited by a human.
pdfjs-editor-new-alt-text-disclaimer1 = Гэты тэкст для атрыбута alt быў створаны аўтаматычна і можа быць недакладным
pdfjs-editor-new-alt-text-disclaimer-learn-more-url = Даведацца больш
pdfjs-editor-new-alt-text-create-automatically-button-label = Ствараць тэкст для атрыбута alt аўтаматычна
pdfjs-editor-new-alt-text-not-now-button = Не зараз
pdfjs-editor-new-alt-text-error-title = Не ўдалося аўтаматычна стварыць тэкст для атрыбута alt
pdfjs-editor-new-alt-text-error-description = Калі ласка, напішыце ўласны тэкст для атрыбута alt або паўтарыце спробу пазней.
pdfjs-editor-new-alt-text-error-close-button = Закрыць
# Variables:
#   $totalSize (Number) - the total size (in MB) of the AI model.
#   $downloadedSize (Number) - the downloaded size (in MB) of the AI model.
pdfjs-editor-new-alt-text-ai-model-downloading-progress = Сцягванне мадэлі ШІ для тэксту для атрыбута alt ({ $downloadedSize } з { $totalSize } МБ)
    .aria-valuetext = Сцягванне мадэлі ШІ для тэксту для атрыбута alt ({ $downloadedSize } з { $totalSize } МБ)
# This is a button that users can click to edit the alt text they have already added.
pdfjs-editor-new-alt-text-added-button =
    .aria-label = Тэкст для атрыбута alt дададзены
pdfjs-editor-new-alt-text-added-button-label = Тэкст для атрыбута alt дададзены
# This is a button that users can click to open the alt text editor and add alt text when it is not present.
pdfjs-editor-new-alt-text-missing-button =
    .aria-label = Адсутнічае тэкст для атрыбута alt
pdfjs-editor-new-alt-text-missing-button-label = Адсутнічае тэкст для атрыбута alt
# This is a button that opens up the alt text modal where users should review the alt text that was automatically generated.
pdfjs-editor-new-alt-text-to-review-button =
    .aria-label = Водгук на тэкст для атрыбута alt
pdfjs-editor-new-alt-text-to-review-button-label = Водгук на тэкст для атрыбута alt
# "Created automatically" is a prefix that will be added to the beginning of any alt text that has been automatically generated. After the colon, the user will see/hear the actual alt text description. If the alt text has been edited by a human, this prefix will not appear.
# Variables:
#   $generatedAltText (String) - the generated alt-text.
pdfjs-editor-new-alt-text-generated-alt-text-with-disclaimer = Створаны аўтаматычна: { $generatedAltText }

## Image alt-text settings

pdfjs-image-alt-text-settings-button =
    .title = Налады альтэрнатыўнага тэксту для выявы
pdfjs-image-alt-text-settings-button-label = Налады альтэрнатыўнага тэксту для выявы
pdfjs-editor-alt-text-settings-dialog-label = Налады альтэрнатыўнага тэксту для выявы
pdfjs-editor-alt-text-settings-automatic-title = Аўтаматычны тэкст для атрыбута alt
pdfjs-editor-alt-text-settings-create-model-button-label = Ствараць тэкст для атрыбута alt аўтаматычна
pdfjs-editor-alt-text-settings-create-model-description = Прапануе апісанні, каб дапамагчы людзям, якія не бачаць выяву, ці калі выява не загружаецца.
# Variables:
#   $totalSize (Number) - the total size (in MB) of the AI model.
pdfjs-editor-alt-text-settings-download-model-label = Мадэль ШІ для тэксту для атрыбута alt ({ $totalSize } МБ)
pdfjs-editor-alt-text-settings-ai-model-description = Працуе лакальна на вашай прыладзе, таму вашы звесткі застаюцца прыватнымі. Патрабуецца для аўтаматычнага альтэрнатыўнага тэксту.
pdfjs-editor-alt-text-settings-delete-model-button = Выдаліць
pdfjs-editor-alt-text-settings-download-model-button = Сцягнуць
pdfjs-editor-alt-text-settings-downloading-model-button = Сцягванне…
pdfjs-editor-alt-text-settings-editor-title = Рэдактар тэксту для атрыбута alt
pdfjs-editor-alt-text-settings-show-dialog-button-label = Адразу паказваць рэдактар тэксту для атрыбута alt пры даданні выявы
pdfjs-editor-alt-text-settings-show-dialog-description = Дапамагае пераканацца, што ўсе вашы выявы маюць альтэрнатыўны тэкст.
pdfjs-editor-alt-text-settings-close-button = Закрыць

## Accessibility labels (announced by screen readers) for objects added to the editor.

pdfjs-editor-highlight-added-alert = Вылучэнне дададзена
pdfjs-editor-freetext-added-alert = Тэкст дададзены
pdfjs-editor-ink-added-alert = Малюнак дададзены
pdfjs-editor-stamp-added-alert = Выява дададзена
pdfjs-editor-signature-added-alert = Подпіс дададзены

## "Annotations removed" bar

pdfjs-editor-undo-bar-message-highlight = Падсвятленне выдалена
pdfjs-editor-undo-bar-message-freetext = Тэкст выдалены
pdfjs-editor-undo-bar-message-ink = Малюнак выдалены
pdfjs-editor-undo-bar-message-stamp = Відарыс выдалены
pdfjs-editor-undo-bar-message-signature = Подпіс выдалены
# Variables:
#   $count (Number) - the number of removed annotations.
pdfjs-editor-undo-bar-message-multiple =
    { $count ->
        [one] { $count } анатацыя выдалена
        [few] { $count } анатацыі выдалена
       *[many] { $count } анатацый выдалена
    }
pdfjs-editor-undo-bar-undo-button =
    .title = Адмяніць
pdfjs-editor-undo-bar-undo-button-label = Адмяніць
pdfjs-editor-undo-bar-close-button =
    .title = Закрыць
pdfjs-editor-undo-bar-close-button-label = Закрыць

## Add a signature dialog

pdfjs-editor-add-signature-dialog-label = Гэты рэжым дазваляе карыстальніку ствараць подпіс для дадання ў дакумент PDF. Карыстальнік можа рэдагаваць імя (якое таксама служыць альтэрнатыўным тэкстам) і пры жаданні захаваць подпіс для паўторнага выкарыстання.
pdfjs-editor-add-signature-dialog-title = Дадаць подпіс

## Tab names

# Type is a verb (you can type your name as signature)
pdfjs-editor-add-signature-type-button = Увод
    .title = Увод
# Draw is a verb (you can draw your signature)
pdfjs-editor-add-signature-draw-button = Маляваць
    .title = Маляваць
pdfjs-editor-add-signature-image-button = Выява
    .title = Выява

## Tab panels

pdfjs-editor-add-signature-type-input =
    .aria-label = Увядзіце свой подпіс
    .placeholder = Увядзіце свой подпіс
pdfjs-editor-add-signature-draw-placeholder = Намалюйце свой подпіс
pdfjs-editor-add-signature-draw-thickness-range-label = Таўшчыня
# Variables:
#   $thickness (Number) - the thickness (in pixels) of the line used to draw a signature.
pdfjs-editor-add-signature-draw-thickness-range =
    .title = Таўшчыня малюнка: { $thickness }
pdfjs-editor-add-signature-image-placeholder = Перацягнуць файл сюды, каб загрузіць
pdfjs-editor-add-signature-image-browse-link =
    { PLATFORM() ->
        [macos] Або праглядайце файлы малюнкаў
       *[other] Або праглядайце файлы малюнкаў
    }

## Controls

pdfjs-editor-add-signature-description-label = Апісанне (альтэрнатыўны тэкст)
pdfjs-editor-add-signature-description-input =
    .title = Апісанне (альтэрнатыўны тэкст)
pdfjs-editor-add-signature-description-default-when-drawing = Подпіс
pdfjs-editor-add-signature-clear-button-label = Выдаліць подпіс
pdfjs-editor-add-signature-clear-button =
    .title = Выдаліць подпіс
pdfjs-editor-add-signature-save-checkbox = Захаваць подпіс
pdfjs-editor-add-signature-save-warning-message = Вы дасягнулі ліміту ў 5 захаваных подпісаў. Выдаліце адзін, каб захаваць іншы.
pdfjs-editor-add-signature-image-upload-error-title = Не ўдалося загрузіць выяву
pdfjs-editor-add-signature-image-upload-error-description = Праверце падключэнне да сеткі ці паспрабуйце іншую выяву.
pdfjs-editor-add-signature-image-no-data-error-title = Не ўдалося пераўтварыць гэту выяву ў подпіс
pdfjs-editor-add-signature-image-no-data-error-description = Калі ласка, паспрабуйце зацягнуць іншую выяву.
pdfjs-editor-add-signature-error-close-button = Закрыць

## Dialog buttons

pdfjs-editor-add-signature-cancel-button = Скасаваць
pdfjs-editor-add-signature-add-button = Дадаць
pdfjs-editor-edit-signature-update-button = Абнавіць

## Comment popup

pdfjs-editor-edit-comment-popup-button-label = Змяніць каментарый
pdfjs-editor-edit-comment-popup-button =
    .title = Змяніць каментарый
pdfjs-editor-delete-comment-popup-button-label = Выдаліць каментарый
pdfjs-editor-delete-comment-popup-button =
    .title = Выдаліць каментарый
pdfjs-show-comment-button =
    .title = Паказаць каментарый

##  Edit a comment dialog

pdfjs-editor-edit-comment-actions-button-label = Дзеянні
pdfjs-editor-edit-comment-actions-button =
    .title = Дзеянні
pdfjs-editor-edit-comment-close-button-label = Закрыць
pdfjs-editor-edit-comment-close-button =
    .title = Закрыць
pdfjs-editor-edit-comment-actions-edit-button-label = Праўка
pdfjs-editor-edit-comment-actions-delete-button-label = Выдаліць
pdfjs-editor-edit-comment-manager-text-input =
    .placeholder = Увядзіце свой каментарый
pdfjs-editor-edit-comment-manager-cancel-button = Скасаваць
pdfjs-editor-edit-comment-manager-save-button = Захаваць
# An existing comment is edited
pdfjs-editor-edit-comment-dialog-title-when-editing = Змяніць каментарый
pdfjs-editor-edit-comment-dialog-save-button-when-editing = Абнавіць
# No existing comment
pdfjs-editor-edit-comment-dialog-title-when-adding = Дадаць каментарый
pdfjs-editor-edit-comment-dialog-save-button-when-adding = Дадаць
pdfjs-editor-edit-comment-dialog-text-input =
    .placeholder = Пачніце набор тэксту…
pdfjs-editor-edit-comment-dialog-cancel-button = Скасаваць

## Edit a comment button in the editor toolbar

pdfjs-editor-edit-comment-button =
    .title = Змяніць каментарый

## Main menu for adding/removing signatures

pdfjs-editor-delete-signature-button1 =
    .title = Выдаліць захаваны подпіс
pdfjs-editor-delete-signature-button-label1 = Выдаліць захаваны подпіс

## Editor toolbar

pdfjs-editor-add-signature-edit-button-label = Рэдагаваць апісанне

## Edit signature description dialog

pdfjs-editor-edit-signature-dialog-title = Рэдагаваць апісанне
