/* Copyright 2021 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// We use these symbols to avoid name conflict between tags
// and properties/methods names.
const $acceptWhitespace = Symbol();
const $addHTML = Symbol();
const $appendChild = Symbol();
const $childrenToHTML = Symbol();
const $clean = Symbol();
const $cleanPage = Symbol();
const $cleanup = Symbol();
const $clone = Symbol();
const $consumed = Symbol();
const $content = Symbol("content");
const $data = Symbol("data");
const $dump = Symbol();
const $extra = Symbol("extra");
const $finalize = Symbol();
const $flushHTML = Symbol();
const $getAttributeIt = Symbol();
const $getAttributes = Symbol();
const $getAvailableSpace = Symbol();
const $getChildrenByClass = Symbol();
const $getChildrenByName = Symbol();
const $getChildrenByNameIt = Symbol();
const $getDataValue = Symbol();
const $getExtra = Symbol();
const $getRealChildrenByNameIt = Symbol();
const $getChildren = Symbol();
const $getContainedChildren = Symbol();
const $getNextPage = Symbol();
const $getSubformParent = Symbol();
const $getParent = Symbol();
const $getTemplateRoot = Symbol();
const $globalData = Symbol();
const $hasSettableValue = Symbol();
const $ids = Symbol();
const $indexOf = Symbol();
const $insertAt = Symbol();
const $isCDATAXml = Symbol();
const $isBindable = Symbol();
const $isDataValue = Symbol();
const $isDescendent = Symbol();
const $isNsAgnostic = Symbol();
const $isSplittable = Symbol();
const $isThereMoreWidth = Symbol();
const $isTransparent = Symbol();
const $isUsable = Symbol();
const $lastAttribute = Symbol();
const $namespaceId = Symbol("namespaceId");
const $nodeName = Symbol("nodeName");
const $nsAttributes = Symbol();
const $onChild = Symbol();
const $onChildCheck = Symbol();
const $onText = Symbol();
const $pushGlyphs = Symbol();
const $popPara = Symbol();
const $pushPara = Symbol();
const $removeChild = Symbol();
const $root = Symbol("root");
const $resolvePrototypes = Symbol();
const $searchNode = Symbol();
const $setId = Symbol();
const $setSetAttributes = Symbol();
const $setValue = Symbol();
const $tabIndex = Symbol();
const $text = Symbol();
const $toPages = Symbol();
const $toHTML = Symbol();
const $toString = Symbol();
const $toStyle = Symbol();
const $uid = Symbol("uid");

export {
  $acceptWhitespace,
  $addHTML,
  $appendChild,
  $childrenToHTML,
  $clean,
  $cleanPage,
  $cleanup,
  $clone,
  $consumed,
  $content,
  $data,
  $dump,
  $extra,
  $finalize,
  $flushHTML,
  $getAttributeIt,
  $getAttributes,
  $getAvailableSpace,
  $getChildren,
  $getChildrenByClass,
  $getChildrenByName,
  $getChildrenByNameIt,
  $getContainedChildren,
  $getDataValue,
  $getExtra,
  $getNextPage,
  $getParent,
  $getRealChildrenByNameIt,
  $getSubformParent,
  $getTemplateRoot,
  $globalData,
  $hasSettableValue,
  $ids,
  $indexOf,
  $insertAt,
  $isBindable,
  $isCDATAXml,
  $isDataValue,
  $isDescendent,
  $isNsAgnostic,
  $isSplittable,
  $isThereMoreWidth,
  $isTransparent,
  $isUsable,
  $lastAttribute,
  $namespaceId,
  $nodeName,
  $nsAttributes,
  $onChild,
  $onChildCheck,
  $onText,
  $popPara,
  $pushGlyphs,
  $pushPara,
  $removeChild,
  $resolvePrototypes,
  $root,
  $searchNode,
  $setId,
  $setSetAttributes,
  $setValue,
  $tabIndex,
  $text,
  $toHTML,
  $toPages,
  $toString,
  $toStyle,
  $uid,
};
