package('org.anclab.steller.canvas-slider', function () {

    // Sets up and returns a canvas element implementation of a
    // named "slider" control. The slider behaviour is described
    // in the spec object and getset is a function used to get
    // and set values to update a model when the slider value
    // changes.
    //
    // getset() is called to get the slider's value to display,
    // and when the user changes the slider value, 
    //
    // getset(newvalue) is called to update a model when the
    // value changes due to user interaction with the slider.
    //
    // spec = {label: "name", min: 0, max: 100, step: 1}
    //
    // The UI argument provides look and feel settings, an example
    // of which is -
    //      { 
    //          width:          100,
    //          height:         22,
    //          fillColor:      'rgba(0, 0, 0, 0.25)', 
    //          strokeColor:    'rgba(0, 0, 0, 0.25)',
    //          textColor:      'rgba(0, 0, 0, 0.7)',
    //          font:           '14px sans-serif',
    //          inset:          2,
    //          textInset:      6
    //      }
    //
    //
    // The canvas DOM object will, after setup, get a draw()
    // method which the API user can call to redraw the canvas.
    function setup_canvas_slider(spec, getset, UI) {
        var canvas = document.createElement('canvas');
        canvas.setAttribute('class', 'span2');
        canvas.setAttribute('height', UI.height);
        canvas.setAttribute('width', UI.width);
        var ctxt = canvas.getContext('2d');

        function xtoval(x) {
            var smooth = (spec.max - spec.min) * (x - UI.inset) / (canvas.width - 2 * UI.inset);
            return Math.max(spec.min, Math.min(spec.min + spec.step * Math.round(smooth / spec.step), spec.max));
        }

        function valtox(val) {
            return UI.inset + (canvas.width - 2 * UI.inset) * (val - spec.min) / (spec.max - spec.min);
        }

        var allowValueChange = false;

        function draw(x) {
            var s = UI;

            ctxt.clearRect(0, 0, canvas.width, canvas.height);
            ctxt.fillStyle = s.fillColor;
            ctxt.fillRect(s.inset, s.inset, x - s.inset, canvas.height - 2 * s.inset);
            ctxt.strokeStyle = s.strokeColor;
            ctxt.lineWidth = 1;
            ctxt.strokeRect(s.inset, s.inset, canvas.width - 2 * s.inset, canvas.height - 2 * s.inset);
            ctxt.font = s.font;
            ctxt.fillStyle = s.textColor,
                ctxt.fillText(spec.label, s.textInset, canvas.height - s.textInset);
        }

        function changeValue(e) {
            if (allowValueChange) {
                var xy = canvas.relMouseCoords(e);
                if (xy.y >= UI.inset && xy.y <= canvas.height - UI.inset) {
                    var x = Math.max(UI.inset, Math.min(xy.x, canvas.width - UI.inset));
                    draw(x);
                    getset(xtoval(x));
                } else {
                    allowValueChange = false;
                }
            }
        }

        draw(valtox(getset()));
        canvas.onmousedown = function (e) { allowValueChange = true; changeValue(e); };
        canvas.onmousemove = changeValue;
        canvas.onmouseup = function (e) { changeValue(e); allowValueChange = false; };
        canvas.draw = function () {
            draw(valtox(getset()));
        };
        return canvas;
    }

    return {
        setup: setup_canvas_slider
    };
});
