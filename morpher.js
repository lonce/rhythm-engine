package('org.anclab.steller.morpher', function () {

    /**
     * Given a canvas 2d object in the HTML page, you can
     * set it up as a 2D morpher using this function.
     *
     * canvasID gives the id of the <canvas> element
     * that you want to turn into a morpher.
     *
     * UI is an object giving the visual specs of 
     * the morpher such as colors to use, etc. Here are
     * the fields you can pass -
     *      {
     *          borderColor:        'black',
     *          handleRadius:       8,
     *          handleTextOffset:   3,
     *          color:              'red',
     *          presetColor:        'black',
     *          presetTextColor:    'white'
     *      }
     *
     * re is an object with callback methods to handle various
     * activities of the morpher. The rhythm-engine object provides
     * these functions and hence 're' is used as the variable name
     * for this parameter, but you can supply any object that provides
     * the following methods -
     *
     *      re.morpherPos() -> {x: xpos, y: ypos}
     *      This is expected to give the "current position" of the morpher.
     *
     *      re.numPresets() -> N
     *      Gives the number of presets that might be used with the morpher.
     *
     *      re.preset(i) -> {pos: {x: xpos, y: ypos}, useInMorph: true|false}
     *      Gives position information about the preset i, where the numbering
     *      starts from 0 as usual.
     *
     *      re.changePresetPos(i, x, y)
     *      Changes the 2D position of the indexed preset to (x,y).
     *
     *      re.enableMorph(true|false)
     *      Called to indicate that morphing is being enabled.
     *
     *      re.changeMorpherPos(x, y)
     *      Called to indicate that the morpher's position is changing.
     *
     * Preset objects can be dropped onto the morpher. Preset objects are identified
     * by 1-based number that is expected to be their "text value" when they're dropped
     * on the morpher.
     *
     * After setup is complete, the morpher canvas element gets the following
     * additional methods -
     *
     *  morpher.stateSnapshot() - Calling will return a snapshot of the morpher's
     *  current visual state.
     *
     *  morpher.draw() - Calling will force a redraw of the morpher.
     */
    function setup(canvasID, re, UI) {
        var morpher = document.getElementById(canvasID);
        var ctxt = morpher.getContext('2d');

        function draw() {
            ctxt.save();

            var morpherPos = re.morpherPos();

            // Clear the morpher area and draw a bounding box.
            ctxt.clearRect(0, 0, morpher.width, morpher.height);
            ctxt.lineStyle = UI.borderColor;
            ctxt.strokeRect(0, 0, morpher.width, morpher.height);

            // Draw all the presets as black filled circles with 
            // a white number in the middle indicating the preset.
            var i, N, ps;
            for (i = 0, N = re.numPresets(); i < N; ++i) {
                ps = re.preset(i);
                if (ps && ps.useInMorph) {
                    ctxt.beginPath();
                    ctxt.moveTo(ps.pos.x, ps.pos.y);
                    ctxt.lineTo(morpherPos.x, morpherPos.y);
                    ctxt.stroke();

                    ctxt.fillStyle = UI.presetColor;
                    ctxt.beginPath();
                    ctxt.arc(ps.pos.x, ps.pos.y, UI.handleRadius, 0, Math.PI * 2);
                    ctxt.fill();
                    ctxt.fillStyle = UI.presetTextColor;
                    ctxt.fillText(''+(i+1), ps.pos.x - UI.handleTextOffset, ps.pos.y + UI.handleTextOffset);
                }
            }

            // Draw the morpher control - a red fille circle.
            ctxt.fillStyle = UI.color;
            ctxt.beginPath();
            ctxt.arc(morpherPos.x, morpherPos.y, UI.handleRadius, 0, Math.PI * 2);
            ctxt.fill();

            ctxt.restore();
        }

        // Makes an object that captures the entire morpher state
        // at the moment it is called.
        function stateSnapshot() {
            var state = {};

            state.morpherPos = re.morpherPos();
            state.presets = [];

            var i, N, ps, p;
            for (i = 0, N = re.numPresets(); i < N; ++i) {
                ps = re.preset(i);
                p = {};
                p.useInMorph = (ps && ps.useInMorph);
                p.pos = (ps ? ps.pos : null);
                state.presets[i] = p;
            }

            return state;
        }

        morpher.addEventListener('dragover', function (e) {
            if (e.preventDefault) {
                e.preventDefault();
            }

            // draw();
        }, false);

        morpher.addEventListener('drop', function (e) {
            if (e.stopPropagation) {
                e.stopPropagation();
            }

            var i = parseInt(e.dataTransfer.getData('Text')) - 1;
            var xy = morpher.relMouseCoords(e);
            re.changePresetPos(i, xy.x, xy.y);
            re.preset(i).useInMorph = true;
            draw();
        }, false);

        morpher.addEventListener('dragenter', function (e) {
        }, false);

        morpher.addEventListener('dragleave', function (e) {
        }, false);

        morpher.onclick = function (e) {
            var xy = morpher.relMouseCoords(e);
            re.enableMorph(true);
            re.changeMorpherPos(xy.x, xy.y);
            draw();
        };

        function xydist(xy1, xy2) {
            var dx = xy1.x - xy2.x;
            var dy = xy1.y - xy2.y;
            return Math.sqrt(dx * dx + dy * dy);
        }

        function cancelOtherMouse(e) {
            if (e.preventDefault) {
                e.preventDefault();
            } else if (e.stopImmediatePropagation) {
                e.stopImmediatePropagation();
            } else {
                e.returnValue = false;
            }
            return false;
        }

        // The morpher mouse behaviour is a bit complicated.
        // We need to handle the following -
        // 1. Click on the morpher and drag it to change the
        //    rhythm's morph position. The morph needs to update
        //    live.
        // 2. Click on any preset and drag it to a new place.
        //    The morph also needs to update live.
        // 3. Click anywhere else to move the morpher there.
        // 4. Mousedown anywhere else, have the morpher move
        //    there, and subseuently follow mousemoves until
        //    the mouse exits the morpher or a mouseup happens.
        // 5. Shift-click a preset to remove it from the morph.
        //
        // All of the above needs to be orchestrated using 
        // the following events - mousedown, mousemove, click.
        // Note that you'll also have to account for the fact that
        // a click is triggered if you mousedowned, moved a bit
        // and did a mouseup. These extra clicks need to be
        // ignored in our case.
        function morpherMouseDown(e) {
            var xy = morpher.relMouseCoords(e);
            var c = re.morpherPos();
            var dist = xydist(xy, c);
            if (dist < UI.handleRadius) {
                // It is a hit on the control position.
                // Now track the control.
                morpher.onmousemove = function (e) {
                    var xy = morpher.relMouseCoords(e);
                    if (xy.x < 0 || xy.x > morpher.width || xy.y < 0 || xy.y > morpher.height || e.which < 1) {
                        // Time to stop.
                        morpher.onmousemove = undefined;
                    } else {
                        re.enableMorph(true);
                        re.changeMorpherPos(xy.x, xy.y);
                    }
                    draw();
                    return cancelOtherMouse(e);
                };
                re.enableMorph(true);
                re.changeMorpherPos(xy.x, xy.y);
                draw();
            } else {
                // Check if any preset has been picked up.
                var i, N, ps;
                for (i = 0, N = re.numPresets(); i < N; ++i) {
                    ps = re.preset(i);
                    if (ps) {
                        dist = xydist(xy, ps.pos);
                        if (dist < UI.handleRadius) {
                            if (e.shiftKey) {
                                // Remove preset from morph upon shift-clicking it.
                                re.enableMorph(true);
                                re.preset(i).useInMorph = false;
                            } else {
                                morpher.onmousemove = (function (i) {
                                    return function (e) {
                                        var xy = morpher.relMouseCoords(e);
                                        if (xy.x < 0 || xy.x > morpher.width || xy.y < 0 || xy.y > morpher.height || e.which < 1) {
                                            // Time to stop. This preset has been dragged out of the
                                            // morpher area. Exclude it from the morph.
                                            morpher.onmousemove = undefined;
                                        } else {
                                            re.enableMorph(true);
                                            re.changePresetPos(i, xy.x, xy.y);
                                        }
                                        draw();
                                        return cancelOtherMouse(e);
                                    };
                                }(i));
                                re.enableMorph(true);
                                re.changePresetPos(i, xy.x, xy.y);
                            }

                            // Ignore the onclick that immediately follows the mousemove.
                            morpher.onclick = (function (onc) {
                                return function (e) {
                                    morpher.onclick = onc;
                                };
                            }(morpher.onclick));

                            draw();
                            return;
                        }
                    }
                }

                // No presets touched. Move morpher to current
                // position immediately.
                if (xy.x >= 0 && xy.x < morpher.width && xy.y >= 0 && xy.y < morpher.height) {
                    re.enableMorph(true);
                    re.changeMorpherPos(xy.x, xy.y);
                    morpherMouseDown(e);
                    return;
                }
            }
        };

        morpher.onmousedown = morpherMouseDown;
        morpher.stateSnapshot = stateSnapshot;
        morpher.draw = draw;

        draw();
    }

    return {
        setup: setup
    };
});
