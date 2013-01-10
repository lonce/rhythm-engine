package('org.anclab.steller.rhythm-engine-gui', 
        ['.browser-compat', '.sample-manager', '.rhythm-engine', '.re-gui-settings', '.canvas-slider', '.morpher'], 
        function (_, SampleManager, RhythmEngine, UI, CanvasSlider, Morpher) {

var RhythmEngineGUI = (function (exports, document, Math) {


    // Utility to type less stuff :P
    function elem(id) {
        return document.getElementById(id);
    }

    function removeAllChildrenOf(rootNode) {
        if (rootNode.hasChildNodes()) {
            while (rootNode.childNodes.length > 0) {
                rootNode.removeChild(rootNode.firstChild);
            }
        }
    }

    // Convenience method to get mouse coordinates of canvas.
    // From stackoverflow post - 
    // http://stackoverflow.com/questions/55677/how-do-i-get-the-coordinates-of-a-mouse-click-on-a-canvas-element
    //
    HTMLCanvasElement.prototype.relMouseCoords = function (event) {
        var totalOffsetX = 0;
        var totalOffsetY = 0;
        var canvasX = 0;
        var canvasY = 0;
        var currentElement = this;

        do {
            totalOffsetX += currentElement.offsetLeft;
            totalOffsetY += currentElement.offsetTop;
        } while(currentElement = currentElement.offsetParent)

        canvasX = event.pageX - totalOffsetX;
        canvasY = event.pageY - totalOffsetY;

        return {x:canvasX, y:canvasY};
    };

    // The elements argument gives the ids of the various
    // parts of the interface. The parts are mostly all
    // expected to be divs, but some are canvases. 
    //
    // The 'name' argument names the rhythm engine you're
    // setting up in this call for the purposes of saving
    // and loading stuff.
    //
    // Expected fields of 'elements' object. All elements
    // are mandatory except 'status'.
    //
    // status: id of a div or span into which status messages
    //      are to be written.
    //
    // voices: The id of the top level div into which
    //      new voices should be inserted.
    //
    // addVoiceButton: The id of the button that when clicked
    //      should cause a new voice to be added to the engine.
    //
    // presets: The id of the div containing sub-divs each of
    //      which stands for a preset.
    //
    // morpher: The id of the morpher 2D canvas. The canvas is expected
    //      to be pre-configured to the necessary size.
    //
    // tempoTextBox: The id of the tempo text field. The value is
    //      parsed as an integer and conformed to a valid range.
    //
    // playStopButton: The id of the button that starts/stops the engine playing.
    //
    // saveButton: Id of button to save RE state upon clicking.
    // loadButton: Id of button to load previously saved RE state.
    //
    // Returns the rhythm engine object that's connected to the
    // supplied controls. Usually you won't need it, but anyway.
    function setup(name, elements, delegate) {
        RhythmEngine.init(null, 'drum-samples', {
            progress: (function (done, total) {
                if (elements.status) {
                    elem(elements.status).innerHTML = 'Loading samples: ' + Math.round(done * 100 / total) + '% done';
                    if (done === total) {
                        elem(elements.status).setAttribute('hidden', 'true');
                    }
                }
            }),
            didInitialize: (function (RE, kits) {
                var re = RE.create(name);
                initGUI(elements, re);
                delegate.didInitialize(name, re);
            })
        });
    }

    function disableControls(elements) {
        elem(elements.playStopButton).setAttribute('disabled', true);
        elem(elements.tempoTextBox).setAttribute('disabled', true);
        elem(elements.tempoTextBox).setAttribute('disabled', true);
        elem(elements.addVoiceButton).setAttribute('disabled', true);
        elem(elements.saveButton).setAttribute('disabled', true);
        elem(elements.loadButton).setAttribute('disabled', true);
        elem(elements.downloadButton).setAttribute('disabled', true);
    }

    function enableControls(elements) {
        elem(elements.playStopButton).removeAttribute('disabled');
        elem(elements.tempoTextBox).removeAttribute('disabled');
        elem(elements.tempoTextBox).removeAttribute('disabled');
        elem(elements.addVoiceButton).removeAttribute('disabled');
        elem(elements.saveButton).removeAttribute('disabled');
        elem(elements.loadButton).removeAttribute('disabled');
        elem(elements.downloadButton).removeAttribute('disabled');
    }

    // Performs blank initialization as well as initialization
    // after the rhythm engine instance has been loaded from
    // a file.
    function initGUI(elements, re) {

        // Up to now, the basic button controls had been 
        // disabled. We're now ready to enable them.
        enableControls(elements);

        // An array that holds a bunch of callbacks to invoke whenever
        // the GUI needs to be refreshed from the model.
        var refreshSliderActions = [];

        // Link up the start and stop buttons.
        var playStopButton = elem(elements.playStopButton);

        function refreshPlayStopButtonState() {
            if (re.running) {
                playStopButton.innerHTML = "Stop";
            } else {
                playStopButton.innerHTML = "Play";
            }
        }
        refreshSliderActions.push(refreshPlayStopButtonState);

        playStopButton.onclick = function (event) {
            if (re.running) {
                re.stop();
            } else {
                re.start();
            }
            refreshPlayStopButtonState();
        };

        refreshPlayStopButtonState();

        function clampTempo(t) {
            return Math.round(Math.max(UI.tempo.min, Math.min(t, UI.tempo.max)));
        }

        // Link up the tempo change text field
        var tempoTextBox = elem(elements.tempoTextBox);
        tempoTextBox.onchange = function (event) {
            var value = parseInt(tempoTextBox.value);
            if (value >= UI.tempo.min || value <= UI.tempo.max) {
                re.tempo_bpm = value;
            }
            value = re.tempo_bpm;
        };
        tempoTextBox.onkeydown = function (event) {
            var t = re.tempo_bpm;

            switch (event.keyCode) {
                case 38: // Key up 
                    t = clampTempo(Math.max(t + 1, t * UI.tempo.incFactor));
                    break;
                case 40: // Key down
                    t = clampTempo(Math.min(t - 1, t * UI.tempo.decFactor));
                    break;
                default: return;
            }

            re.tempo_bpm = t;
            tempoTextBox.value = t;
        };
        tempoTextBox.value = re.tempo_bpm;
        refreshSliderActions.push(function () {
            tempoTextBox.value = Math.round(re.tempo_bpm);
        });


        // The div into which new voices get inserted.
        var voicesDiv = elem(elements.voices);

        var voiceControls = [
        {label: 'phase', min: 0, max: 15, step: 1},
        {label: 'straight', min: 0, max: 1, step: 0.01},
        {label: 'offbeat', min: 0, max: 1, step: 0.01},
        {label: 'funk', min: 0, max: 1, step: 0.01},
        {label: 'random', min: 0, max: 1, step: 0.01},
        {label: 'mean', min: 0, max: 1, step: 0.01},
        {label: 'ramp', min: 0, max: 1, step: 0.01},
        {label: 'threshold', min: 0, max: 1, step: 0.01},
        {label: 'volume', min: 0, max: 1, step: 0.01}
        ];


        function addOneVoice() {
            addVoiceButton.parentNode.removeChild(addVoiceButton);
            setupVoice(re.addVoice());
            voicesDiv.insertAdjacentElement('beforeend', addVoiceButton);
         }

        // Setup the "add voice" button to add a new voice
        // to the engine.
        var addVoiceButton = elem(elements.addVoiceButton);
        addVoiceButton.innerHTML = "Add voice";
        addVoiceButton.style.marginTop = "60px";
        addVoiceButton.onclick = addOneVoice;
        removeAllChildrenOf(voicesDiv);
        setupExistingVoices();

        function setupVoice(voice) {
            var voiceDiv = document.createElement('div');
            voiceDiv.setAttribute('class', 'span2');
            voiceDiv.setAttribute('style', 'padding-bottom: 6px');
            voicesDiv.insertAdjacentElement('beforeend', voiceDiv);

            var i, N, canv;
            for (i = 0, N = voiceControls.length; i < N; ++i) {
                voiceDiv.insertAdjacentElement('beforeend',
                        canv = CanvasSlider.setup(voiceControls[i], (function (field) {
                            return function (val) { 
                                if (val === undefined) {
                                    return voice[field.label];
                                } else {
                                    return voice[field.label] = val;
                                };
                            };
                        }(voiceControls[i])), UI.slider));
                refreshSliderActions.push(canv.draw);
            }

            addKitSelector(voiceDiv, voice);
        }

        function setupExistingVoices() {
            var i, N;
            if (addVoiceButton.parentNode) {
                addVoiceButton.parentNode.removeChild(addVoiceButton);
            }
            for (i = 0, N = re.numVoices(); i < N; ++i) {
                setupVoice(re.voice(i));
            }
            voicesDiv.insertAdjacentElement('beforeend', addVoiceButton);

            // If the voice bank is empty, add one just to help 
            // get started.
            if (re.numVoices() === 0) {
                addOneVoice();
            }
        }

        // Adds the two drum kit selection drop-downs to a voice's control pane.
        function addKitSelector(rootDiv, voice) {
            var kitSel = document.createElement('select');
            kitSel.setAttribute('style', 'width: 100px; height: 22px; font-size: 12px');
            var i, j, N, M, e;
            for (i = 0, N = re.kits.length; i < N; ++i) {
                e = document.createElement('option');
                e.setAttribute('value', re.kits[i].name);
                e.innerText = re.kits[i].name;
                kitSel.insertAdjacentElement('beforeend', e);
            }
            rootDiv.insertAdjacentElement('beforeend', kitSel);

            kitSel.onchange = function (e) {
                voice.voice.kit = kitSel.value;
                voice.voice.drum = drumSel.value;
            };

            kitSel.value = voice.voice.kit;

            // The kits are all already loaded, so the loadSampleSet
            // will trigger immediately. 
            //
            // TODO: Also, we're assuming here that the set of drum 
            // names is the same for all the kits. This is only temporarily 
            // true and the code will have to be generalized for arbitrary 
            // kit collections.
            var drumSel = document.createElement('select');
            drumSel.setAttribute('style', 'width: 100px; height: 22px; font-size: 12px');
            SampleManager.loadSampleSet(re.kits[0].name, re.kits[0].url, {
                didFinishLoadingSampleSet: function (name, sset) {
                    var drums = Object.keys(sset);
                    var e, i, N;
                    for (i = 0, N = drums.length; i < N; ++i) {
                        e = document.createElement('option');
                        e.setAttribute('value', drums[i]);
                        e.innerText = drums[i];
                        drumSel.insertAdjacentElement('beforeend', e);
                    }

                    rootDiv.insertAdjacentElement('beforeend', drumSel);

                    drumSel.onchange = function (e) {
                        voice.voice.drum = drumSel.value;
                    };

                    kitSel.value = voice.voice.kit;
                    drumSel.value = voice.voice.drum;
                }
            });
        }

        // Setup the presets section.
        (function () {
            var presetElems = elem(elements.presets);
            function makeActive(p) {
                var c = presetElems.children[p];
                c.style.backgroundColor = UI.preset.activeColor;
                c.setAttribute('draggable', 'true');
            }

            function flashPreset(p) {
                var c = presetElems.children[p];
                c.style.backgroundColor = UI.preset.flashColor;
                setTimeout(function () { c.style.backgroundColor = UI.preset.activeColor; }, 60);
            }

            var i, N, c;
            for (i = 0, N = presetElems.children.length; i < N; ++i) {
                c = presetElems.children[i];
                UI.preset.setStyle(c.style);
                c.innerHTML = ''+(i+1);

                c.ondragstart = (function (i) {
                    return function (e) {
                        e.dataTransfer.effectAllowed = 'all';
                        e.dataTransfer.setData('Text', '' + (i + 1));
                    };
                }(i));

                c.onclick = (function (i, c) {
                    return function (e) {
                        // Save a preset.
                        var ilim = Math.min(re.numPresets(), i);
                        re.saveAsPreset(ilim);
                        makeActive(ilim);
                        flashPreset(ilim);
                    };
                }(i, c));

                if (i < re.numPresets() && re.preset(i)) {
                    // If preset already exists, mark it as draggable.
                    makeActive(i);
                }
            }
        }());

        // Setup the morpher 2D canvas.
        Morpher.setup(elements.morpher, re, UI.morpher);

        // Set the refresh actions to be called whenever the
        // engine's morph situation changes.
        re.onMorphUpdate = function () {
            var i, N;
            for (i = 0, N = refreshSliderActions.length; i < N; ++i) {
                refreshSliderActions[i]();
            }
        };

        // Setup the settings name field.
        var settingsNameField = elem(elements.settingsNameField);
        var settingsList = elem(settingsNameField.getAttribute('list'));
        settingsList.onchange = function (event) {
            settingsNameField.value = settingsList.value;
        };
        settingsList.onclick = settingsList.onchange;

        function refreshSettingsList() {
            removeAllChildrenOf(settingsList);
            re.list({
                didListSettings: function (settings) {
                    var i, N, e;
                    for (i = 0, N = settings.length; i < N; ++i) {
                        e = document.createElement('option');
                        e.innerText = settings[i];
                        settingsList.insertAdjacentElement('beforeend', e);
                    }
                    settingsList.value = settingsNameField.value || settingsList.value;
                },
                onError: function (e) {
                    console.error(e);
                }
            });
        }
        refreshSettingsList();

        // Setup the save button.
        var saveButton = elem(elements.saveButton);
        saveButton.onclick = function (e) {
            re.save(settingsNameField.value, {
                didSave: refreshSettingsList
            });
        };
        saveButton.innerText = "Save";

        // Map the load button.
        var loadButton = elem(elements.loadButton);
        loadButton.onclick = function (e) {
            disableControls(elements);
            re.load(settingsNameField.value, {
                didLoad: function () {
                    initGUI(elements, re);
                    re.onMorphUpdate();
                },
                onError: function (e) {
                    debugger;
                    console.error(e);
                    alert(e.toString());
                }
            });
        };
        loadButton.innerText = "Load";


        // Map the download button.
        // There is a hidden "download link" to the virtual file
        // created by the "Save to file" button. Once the link
        // is prepared with an "object URL" containing the relevant
        // JSON data, the link is made visible in place of the
        // "Drop file here to load" message. Once you download the
        // file, the link is hidden and the message is shown again.
        var downloadButton = elem(elements.downloadButton);
        var prevDownloadedSnapshot;
        downloadButton.onclick = function (e) {
            re.stop();
            refreshPlayStopButtonState();
            var bb = new BlobBuilder();
            bb.append(re.snapshot());
            var filename = 'resnapshot.json';
            var downloadLink = elem(elements.downloadButton + '_link');
            downloadLink.innerText = filename;
            if (prevDownloadedSnapshot) {
                // Cleanup the thing. The object URL is kept using
                // a window-global reference by the browser and it depends
                // on us to explicitly revoke it.
                window.URL.revokeObjectURL(prevDownloadedSnapshot);
                prevDownloadedSnapshot = undefined;
            }
            downloadLink.href = prevDownloadedSnapshot = window.URL.createObjectURL(bb.getBlob('application/json'));
            downloadLink.download = filename;
            var dropMessage = elem(downloadLink.getAttribute('message'));
            var dropMessageParent = dropMessage.parentNode;
            dropMessageParent.removeChild(dropMessage);
            downloadLink.removeAttribute('hidden');
            downloadLink.onclick = function (e) {
                downloadLink.setAttribute('hidden', true);
                dropMessageParent.insertAdjacentElement('afterbegin', dropMessage);
            };
        };
        downloadButton.innerText = 'Save to file';

        // Add drag and drop file setting.
        // Code based on example from CSS Ninja - 
        // http://www.thecssninja.com/demo/drag-drop_upload/v2/
        var dropArea = elem(elements.dropArea);
        dropArea.addEventListener("dragenter", 
                function (event) {
                    event.stopPropagation();
                    event.preventDefault();
                }, false);
        dropArea.addEventListener("dragover", 
                function (event) {
                    event.stopPropagation();
                    event.preventDefault();
                }, false);
        dropArea.addEventListener('drop', function (evt) {
            disableControls(elements);
            re.stop();
            refreshPlayStopButtonState();
            var files = evt.dataTransfer.files;
            var reader = new FileReader();
            reader.file = files[0];
            reader.addEventListener('loadend', function (evt) {
                console.log(evt.target.result);
                re.import(evt.target.result, {
                    didLoad: function () {
                        initGUI(elements, re);
                        re.onMorphUpdate();
                    },
                    onError: function (e) {
                        debugger;
                        console.error(e);
                        alert(e.toString());
                        enableControls(elements);
                    }
                });
            }, false);
            reader.readAsText(files[0]);
        });
    }
    
    // Only one export is needed.
    exports.setup = setup;

    return exports;
}({}, window.document, window.Math));

return RhythmEngineGUI;

});
