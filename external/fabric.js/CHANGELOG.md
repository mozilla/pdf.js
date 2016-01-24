**Edge**
- Added image preserve aspect ratio attributes and functionality (fabric.Image.alignY, fabric.Image.alignY, fabric.Image.meetOrSlic )
- Added ImageResizeFilters , option to resize dinamically or statically the images using a set of resize filter alghoritms.
- [BACK_INCOMPAT] `fabric.Collection#remove` doesn't return removed object -> returns `this` (chainable)

- Add "mouse:over" and "mouse:out" canvas events (and corresponding "mouseover", "mouseout" object events)
- Add support for passing options to `fabric.createCanvasForNode`

- Various iText fixes and performance improvements
- Fix `overlayImage` / `overlayColor` during selection mode
- Fix double callback in loadFromJSON when there's no objects
- Fix paths parsing when number has negative exponent
- Fix background offset in iText
- Fix style object deletion in iText
- Fix typo in `_initCanvasHandlers`
- Fix `transformMatrix` not affecting fabric.Text
- Fix `setAngle` for different originX/originY (!= 'center')
- Change default/init noise/brightness value for `fabric.Image.filters.Noise` and `fabric.Image.filters.Brightness` from 100 to 0
- Add `fabric.Canvas#imageSmoothingEnabled`
- Add `copy/paste` support for iText (uses clipboardData)

**Version 1.4.0**

- [BACK_INCOMPAT] JSON and Cufon are no longer included in default build

- [BACK_INCOMPAT] Change default objects' originX/originY to left/top

- [BACK_INCOMPAT] `fabric.StaticCanvas#backgroundImage` and `fabric.StaticCanvas#overlayImage` are `fabric.Image` instances. `fabric.StaticCanvas#backgroundImageOpacity`, `fabric.StaticCanvas#backgroundImageStretch`, `fabric.StaticCanvas#overlayImageLeft` and `fabric.StaticCanvas#overlayImageTop` were removed.

- [BACK_INCOMPAT] `fabric.Text#backgroundColor` is now `fabric.Object#backgroundColor`

- [BACK_INCOMPAT] Remove `fabric.Object#toGrayscale` and `fabric.Object#overlayFill` since they're too specific

- [BACK_INCOMPAT] Remove `fabric.StaticCanvas.toGrayscale` since we already have that logic in `fabric.Image.filters.Grayscale`.

- [BACK_INCOMPAT] Split `centerTransform` into the properties `centeredScaling` and `centeredRotation`. Object rotation now happens around originX/originY point UNLESS `centeredRotation=true`. Object scaling now happens non-centered UNLESS `centeredScaling=true`.

**Version 1.3.0**

- [BACK_INCOMPAT] Remove selectable, hasControls, hasBorders, hasRotatingPoint, transparentCorners, perPixelTargetFind from default object/json representation of objects.

- [BACK_INCOMPAT] Object rotation now happens around originX/originY point UNLESS `centerTransform=true`.

- [BACK_INCOMPAT] fabric.Text#textShadow has been removed - new fabric.Text.shadow property (type of fabric.Shadow).

- [BACK_INCOMPAT] fabric.BaseBrush shadow properties are combined into one property => fabric.BaseBrush.shadow (shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY no longer exist).

- [BACK_INCOMPAT] `fabric.Path.fromObject` is now async. `fabric.Canvas#loadFromDatalessJSON` is deprecated.

**Version 1.2.0**

- [BACK_INCOMPAT] Make `fabric.Object#toDataURL` synchronous.

- [BACK_INCOMPAT] `fabric.Text#strokeStyle` -> `fabric.Text#stroke`, for consistency with other objects.

- [BACK_INCOMPAT] `fabric.Object.setActive(…)` -> `fabric.Object.set('active', …)`.
                `fabric.Object.isActive` is gone (use `fabric.Object.active` instead)

- [BACK_INCOMPAT] `fabric.Group#objects` -> `fabric.Group._objects`.

**Version 1.1.0**

- [BACK_INCOMPAT] `fabric.Text#setFontsize` becomes `fabric.Object#setFontSize`.

- [BACK_INCOMPAT] `fabric.Canvas.toDataURL` now accepts options object instead linear arguments.
                `fabric.Canvas.toDataURLWithMultiplier` is deprecated;
                use `fabric.Canvas.toDataURL({ multiplier: … })` instead

**Version 1.0.0**
