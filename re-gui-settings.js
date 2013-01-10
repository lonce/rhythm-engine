package('org.anclab.steller.re-gui-settings', function () {

    // A bunch of constants for configuring the rhythm engin UI.
    return {
        slider: { 
            width:          100,
            height:         22,
            fillColor:      'rgba(0, 0, 0, 0.25)', 
            strokeColor:    'rgba(0, 0, 0, 0.25)',
            textColor:      'rgba(0, 0, 0, 0.7)',
            font:           '14px sans-serif',
            inset:          2,
            textInset:      6
        },
        tempo: {
            min:            10,
            max:            480,
            incFactor:      1.025,
            decFactor:      0.975
        },
        preset: {
            activeColor:    '#00BF00',
            flashColor:     '#00EF00',
            setStyle: function (style) {
                style.paddingTop          = "2px";
                style.paddingBottom       = "2px";
                style.backgroundColor     = "#BFBFBF";
                style.height              = "16px";
                style.borderRadius        = "5px";
                style.margin              = "2px";
                style.textAlign           = "center";
            }
        },
        morpher: {
            borderColor:        'black',
            handleRadius:       8,
            handleTextOffset:   3,
            color:              'red',
            presetColor:        'black',
            presetTextColor:    'white'
        }
    };
});


