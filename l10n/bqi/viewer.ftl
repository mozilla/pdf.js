# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Main toolbar buttons (tooltips and alt text for images)

pdfjs-previous-button =
    .title = بلگه دیندایی
pdfjs-previous-button-label = دیندایی
pdfjs-next-button =
    .title = بلگه نیایی
pdfjs-next-button-label = بئڌی
# .title: Tooltip for the pageNumber input.
pdfjs-page-input =
    .title = بلگه
# Variables:
#   $pagesCount (Number) - the total number of pages in the document
# This string follows an input field with the number of the page currently displayed.
pdfjs-of-pages = ز { $pagesCount }
# Variables:
#   $pageNumber (Number) - the currently visible page
#   $pagesCount (Number) - the total number of pages in the document
pdfjs-page-of-pages = ({ $pageNumber } ز { $pagesCount })
pdfjs-zoom-out-button =
    .title = کۊچیر نمایی
pdfjs-zoom-out-button-label = کۊچیر نمایی
pdfjs-zoom-in-button =
    .title = گپ نمایی
pdfjs-zoom-in-button-label = گپ نمایی
pdfjs-zoom-select =
    .title = زۊم کردن
pdfjs-open-file-button =
    .title = گۊشیڌن فایل
pdfjs-open-file-button-label = گۊشیڌن
pdfjs-print-button =
    .title = چاپ
pdfjs-print-button-label = چاپ
pdfjs-save-button =
    .title = زفت
pdfjs-save-button-label = زفت
# Used in Firefox for Android as a tooltip for the download button (“download” is a verb).
pdfjs-download-button =
    .title = دانلود
# Used in Firefox for Android as a label for the download button (“download” is a verb).
# Length of the translation matters since we are in a mobile context, with limited screen estate.
pdfjs-download-button-label = دانلود
pdfjs-bookmark-button-label = بلگه هیم سکویی

##  Secondary toolbar and context menu

pdfjs-tools-button =
    .title = ٱوزارا
pdfjs-tools-button-label = ٱوزارا
pdfjs-cursor-text-select-tool-button-label = ٱوزار پسند هؽل
pdfjs-cursor-hand-tool-button =
    .title = فعال کردن ٱوزار دست
pdfjs-cursor-hand-tool-button-label = ٱوزار دست

## Document properties dialog

pdfjs-document-properties-file-name = نوم فایل:
pdfjs-document-properties-file-size = هندا فایل:
pdfjs-document-properties-title = عونوان:
pdfjs-document-properties-author = هؽل کوݩ:
pdfjs-document-properties-subject = سرتال:
pdfjs-document-properties-page-size = هندا بلگه:
pdfjs-document-properties-page-size-unit-inches = اینچ
pdfjs-document-properties-page-size-unit-millimeters = میلی متر
pdfjs-document-properties-page-size-name-a-three = A3
pdfjs-document-properties-page-size-name-a-four = A4
pdfjs-document-properties-page-size-name-letter = نامه
pdfjs-document-properties-page-size-name-legal = هۊقۊقی

## Variables:
##   $width (Number) - the width of the (current) page
##   $height (Number) - the height of the (current) page
##   $unit (String) - the unit of measurement of the (current) page
##   $name (String) - the name of the (current) page
##   $orientation (String) - the orientation of the (current) page

pdfjs-document-properties-page-size-dimension-string = { $width } × { $height } { $unit } ({ $orientation })
pdfjs-document-properties-page-size-dimension-name-string = { $width } × { $height } { $unit } ({ $name }, { $orientation })

##

pdfjs-document-properties-linearized-yes = هری
pdfjs-document-properties-linearized-no = ن
pdfjs-document-properties-close-button = بستن

## Print

# Variables:
#   $progress (Number) - percent value
pdfjs-print-progress-percent = { $progress }%
pdfjs-print-progress-close-button = لقو

## Tooltips and alt text for side panel toolbar buttons

pdfjs-toggle-sidebar-button =
    .title = آلشت هالت نوار کلی

## Password

pdfjs-password-ok-button = خا
pdfjs-password-cancel-button = لقو

## Editing

pdfjs-editor-stamp-button =
    .title = ٱووردن یا آلشت شؽواتا
pdfjs-editor-stamp-button-label = ٱووردن یا آلشت شؽواتا

## Default editor aria labels

pdfjs-editor-stamp-editor =
    .aria-label = آلشتگر شؽوات

##

# .default-content is used as a placeholder in an empty text editor.
pdfjs-free-text2 =
    .aria-label = آلشتگر هؽل
    .default-content = ناهاڌن پا هؽل کردن...
pdfjs-editor-comments-sidebar-no-comments-link = قلوه دووسته بۊین

## Alt-text dialog

pdfjs-editor-alt-text-cancel-button = لقو

## New alt-text dialog
## Group note for entire feature: Alternative text (alt text) helps when people can't see the image. This feature includes a tool to create alt text automatically using an AI model that works locally on the user's device to preserve privacy.

pdfjs-editor-new-alt-text-disclaimer-learn-more-url = قلوه دووسته بۊین

## Dialog buttons

pdfjs-editor-add-signature-cancel-button = لقو

## Comment popup

pdfjs-editor-edit-comment-popup-button-label = آلشت منشڌ
pdfjs-editor-edit-comment-popup-button =
    .title = آلشت منشڌ

##  Edit a comment dialog

# An existing comment is edited
pdfjs-editor-edit-comment-dialog-title-when-editing = آلشت منشڌ
pdfjs-editor-edit-comment-dialog-cancel-button = لقو
