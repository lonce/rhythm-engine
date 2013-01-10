// Pete Kellock's "Rhythm Engine" ported to Javascript.
// NOTE: Incomplete implementation.
// 
// RhythmEngine.init(drumKits, root_url, delegate)
//      drumKits = null, or array of kit names.
//      root_url = url (without trailing slash) at which
//                 drum kits are located. Must be domain local.
//      delegate = object with callback methods -
//          onError: function (e) {...}
//          didInitialize: function (RhythmEngine) {...}
//          progress: function (done, total) {...}
//
// RhythmEngine.create(name)
//      Creates a new engine and returns it as an object.
//      The name is used to uniquely identify the engine
//      in localStorage.
//
//      load: function (delegate)
//          loads engine state from local storage.
//          The delegate will receive a didLoad: method
//          call once load is complete.
//      save: function ()
//          saves engine state to local storage.
//      import: function (str)
//          Equivalent to load(), except that state is
//          loaded from the given string.
//      start: function ()
//          Starts the engine running.
//      stop: function ()
//          Stops a running engine.
//      running: readonly boolean field
//          Indicates whether the engine is running currently.
//      tempo_bpm: global tempo field
//      onGridTick: function (clock)
//          Callback (optional). Called for each tick of the engine
//          if specified.
//      onMorphUpdate: function ()
//          Callback (optional). Called when a morph calculation
//          was done to the sliders.
//
//      // A "voice" is a drum with a bunch of control
//      // parameters.
//      numVoices: function () -> voice count
//      voice: function (i) -> the voice
//      addVoice: function () -> new voice
//
//      // A "preset" is a snapshot of all parameters of
//      // all voices. Used for morphing.
//      numPresets: function () -> number of saved presets.
//      preset: function (i) -> the preset object.
//          Note that the 'useInMorph' field of the returned
//          object is settable and indicates whether the preset
//          should be included in morph calculations.
//      saveAsPreset: function (i)
//          Snapshots the current state as the preset with index i.
//          i has to fall in the usual valid range, but can be one
//          index beyond to indicate that a new preset is to be recorded.
//
//      // In "Morph" mode, the engine calculates all voice 
//      // parameters based on the arrangement of the presets 
//      // on a 2D plane.
//      enableMorph: function (bool)
//          Enables the next clock tick to execute a morph.
//          Note that if you need to continue doing a morph,
//          then you need to call it again.
//      presetPos: function (p) -> {x: x, y: y}
//          Gives the current position of the preset p.
//      changePresetPos: function (p, x, y)
//          Moves the preset to the new location.
//      morpherPos: function () -> {x: x, y: y}
//          Gives the current position of the "morpher" relative
//          to which all preset weighting is calculated.
//      changeMorpherPos: function (x, y)
//          Moves the morpher to the given location.
//
package('org.anclab.steller.rhythm-engine', ['.sample-manager'], function (SampleManager) {

if (!(window.AudioContext || window.webkitAudioContext)) {
    alert("RhythmEngine needs the Web Audio API. Use the latest version of Chrome.");
    throw false;
} else {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
}

var RhythmEngine = (function (exports, global, Math) {

    var theAudioContext; // Will be set after successful init.
    var fs; // The file system.

    var availableKits = [    
        "4OP-FM",
        "Bongos",
        "CR78",
        "KPR77",
        "Kit3",
        "Kit8",
        "LINN",
        "R8",
        "Stark",
        "Techno",
        "TheCheebacabra1",
        "TheCheebacabra2",
        "acoustic-kit",
        "breakbeat13",
        "breakbeat8",
        "breakbeat9"
    ];

    var availableKitInfos = {};

    var knownDrums = ["hihat", "kick", "snare", "tom1", "tom2", "tom3"];

    var kRhythmPhase16 = [0, 8, 4, 12,
                          2, 10, 6, 14,
                          1, 9, 5, 13,
                          3, 11, 7, 15];

    var kTimeStruc = {
        simple: {
            cycleLength:    16,
            semiQuaversPerBar: 4,
            lastBeat:       function (timeSigN) { return timeSigN - 1; },

            // Hierarchy for progressive wierdness in phase change
            phase:          kRhythmPhase16,

            // Hierarchy of weights on stronger beats in simple time
            straight:       [16, 1, 2, 1,
                             4, 1, 2, 1,
                             8, 1, 2, 1,
                             4, 1, 2, 1],

            // Hierarchy of weights on offbeats in simple time
            offbeat:        [0, 1, 3, 1,
                             10, 1, 3, 1,
                             24, 1, 3, 1,
                             10, 1, 3, 1],

  
            // Hierarchy of weights in 3s in simple time.
            funk:           [32, 4, 2, 7, 3, 2, 
                             16, 4, 2, 6, 3, 2,
                             32, 4, 5, 2]
        },

        compound: {
            cycleLength:    24,
            semiQuaversPerBar: 6,
            lastBeat:       function (timeSigN) { return Math.round(timeSigN / 3) - 1; },

            phase:          kRhythmPhase16,

            // Hierarchy of weights on stronger beats in compound time.
            straight:       [8, 1, 2, 1, 2, 1,
                             4, 1, 2, 1, 2, 1,
                             6, 1, 2, 1, 2, 1,
                             4, 1, 2, 1, 2, 1],
  
            // Hierarchy of weights on offbeats in compound time.
            offbeat:        [0, 2, 4, 2, 4, 2,
                             8, 2, 4, 2, 4, 2,
                             16, 2, 4, 2, 4, 2,
                             8, 2, 4, 2, 4, 2],

            // Hierarchy of weights in 3s in compound time.
            funk:           [16, 1, 1, 1, 2, 1, 1, 1,
                             6, 1, 1, 1, 2, 1, 1, 1, 
                             6, 1, 1, 1, 16, 1, 1, 1]
        }
    };
                          
    // Time signature numerator
    var kTimeSig = {
        N: [4, 2, 3, 3, 6, 9, 12],
        D: [4, 4, 4, 8, 8, 8, 8]
    };

    // Gets the owned keys of the given object as an array.
    // This stuff *should* be there in JS builtin!
    function getKeys(obj) {
        return Object.keys(obj); // Yes it is builtin!
    }

    // Utility to deep copy an object for snapshotting purposes.
    // Assumes there are no cycles in the data structure.
    function copy_object(obj) {
        var copy, k, N;

        if (obj instanceof Array) {
            copy = [];
            for (k = 0, N = obj.length; k < N; ++k) {
                copy.push(copy_object(obj[k]));
            }
            return copy;
        } else if (obj instanceof Object) {
            copy = {};
            for (k in obj) {
                copy[k] = copy_object(obj[k]);
            }
            return copy;
        } else {
            return obj;
        }
    }

 
    // Makes a limiter function for latching a value to lower-upper bounds.
    function limiter(lo, hi) {
        return function (val) {
            return (val < lo ? lo : (val > hi ? hi : val));
        };
    }

    // The standard limit is from [0, 1] which will be used
    // for the various continuous parameters to the rhythm engine.
    var stdLimit = limiter(0, 1);

    // The offbeat control behaves a bit differently and "reflects"
    // as the weight goes above 1.
    function offbeatLimit(w) {
        return stdLimit(w > 1 ? (1 - 2 * (w - 1)) : w);
    }

    // The core function that calculates the "velocity" with which
    // a voice should be driven given the various rhythm parameters
    // and info about the current musical time.
    function velocity(rhythm, time) {
        var timeStruc       = kTimeStruc[time.struc]; // time.struc = "simple" or "compound".
        var gridPos         = time.pos % timeStruc.cycleLength;
        var pspos           = (gridPos + timeStruc.phase[Math.floor(rhythm.phase)]) % timeStruc.cycleLength;
        var straightWeight  = stdLimit(rhythm.straight * timeStruc.straight[pspos] / 3);
        var offbeatWeight   = offbeatLimit(rhythm.offbeat * timeStruc.offbeat[pspos] / 2);
        var funkWeight      = stdLimit(rhythm.funk * timeStruc.funk[pspos] / 5);
        var randomWeight    = rhythm.random * (Math.random() * (0.25 + 1) - 0.25) / 0.5;
        var rampWeight      = (rhythm.ramp - 0.5) * (pspos - 8) / 6;
        var totalWeights    = straightWeight + offbeatWeight + funkWeight + randomWeight + rampWeight;

        return totalWeights;
    }

    // Generates one hit of one voice for one grid tick.
    function genBeat(rhythm, time, when_secs) {

        var vel = velocity(rhythm, time);

        var lastBeat = kTimeStruc[time.struc].lastBeat(kTimeSig.N[time.sig]);

        // Cycle Weight 
        var cycleWeight = Math.floor(1 + 8 * rhythm.cycleWeight);

        // At every first bar of the cycle, increase vel by scale factor
        // start increasing weight on last beat of previous bar
        //This is so as MidiBeat() is always generating 1 beat ahead
        if (((time.bar + 1) % time.cycleLength === 0) && (time.beat === lastBeat)) {
            vel = vel * cycleWeight;
        }

        // continue to increase weight till last beat of current bar
        if (false && (time.bar % time.cycleLength === 0) && (time.beat !== lastBeat)) {  
            vel = vel * cycleWeight;
        }


        // Apply threshold
        if (vel < rhythm.threshold) {
            vel = 0;
        }
            
        // Adjust mean
        if (vel > 0) {
            vel += 2 * rhythm.mean - 1; // Add +/- 1.0
        }

        // Limit 0 to 1
        vel = stdLimit(vel);

        playNote(when_secs, rhythm.voice, vel * rhythm.volume);
    }
   
    function playNote(when_secs, voice, vel) {
        if (vel > 1/129) {
            SampleManager.play(voice.kit, voice.drum, vel, 1.0, when_secs, 0.0);
        }
    }

    // Note, currently I'm using requestAnimationFrame, but that's not the
    // ideal scheduler. JavascriptAudioNode might be a better choice.
    // In either case, though, I'll have to calculate times and adjustment
    // for accurate scheduling, which I'm not doing as well as it can be done
    // at the moment. For the moment, what I have suffices, but I'll likely
    // change the scheme when swing gets introduced.
    var nextFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame;
    if (!nextFrame) {
        alert("Bad browser! No window.requestAnimationFrame!");
        throw false;
    }


    // Main function to instantiate a new engine object.
    function newRE(name) {

        // Object holding defaults for various saved fields.
        var virginData = {
            type: "pk_rhythm_engine",
            version: 1,
            morpher: {x: 36, y: 36},
            kits: [],
            voices: [],
            presets: [],
            clock: {struc: "simple", sig: 0, bar: 0, beat: 0, pos: 0, tempo_bpm: 90, cycleLength: 16, running: false}
        };

        // data will be saved and loaded to localStorage.
        var data = copy_object(virginData);

        var clockLastTime_secs = undefined;
        var lastTickTime_secs = 0;
        var kDelay_secs = 0.05;
        var clockJSN = undefined;

        // Load info about existing kits into the engine.
        function initData() {
            var k, ki;
            for (k in availableKitInfos) {
                ki = availableKitInfos[k];
                data.kits.push({
                    name: ki.name,
                    url: ki.url
                });
            }
        }

        initData();

        var kitNames = [];

        // Status of whether the clockTick() should do morphing calculations.
        var morphEnabled = 0;
        var morphNeedsUpdate = false;

        // Clock callbacks.
        var onGridTick = undefined;
        var onMorphUpdate = undefined;

        // Runs at about 60 ticks per second (linked to screen refresh rate).
        function clockTick() {
            var clock = data.clock;

            // Check whether the engine is running.
            if (!clock.running) {
                clockLastTime_secs = undefined;
                return;
            }

            var delta_secs = 0, dbeat, dbar;

            while (true) {
                if (clockLastTime_secs) {
                    var now_secs = theAudioContext.currentTime;
                    var sqpb = kTimeStruc[clock.struc].semiQuaversPerBar;
                    var ticks_per_sec = clock.tempo_bpm * sqpb / 60;
                    var nextTickTime_secs = lastTickTime_secs + 1 / ticks_per_sec;
                    if (now_secs + kDelay_secs >= nextTickTime_secs) {
                        dbeat = Math.floor(((clock.pos % sqpb) + 1) / sqpb);
                        dbar = Math.floor((clock.beat + dbeat) / kTimeSig.D[clock.sig]);
                        clock.bar = (clock.bar + dbar) % kTimeStruc[clock.struc].cycleLength;
                        clock.beat = (clock.beat + dbeat) % kTimeSig.N[clock.sig];
                        clock.pos = clock.pos + 1;
                        lastTickTime_secs = nextTickTime_secs;
                    } else {
                        return;
                    }
                } else {
                    // Very first call.
                    clockLastTime_secs = theAudioContext.currentTime;
                    clock.bar = 0;
                    clock.beat = 0;
                    clock.pos = 0;
                    lastTickTime_secs = clockLastTime_secs + kDelay_secs;
                }

                // If we're doing a morph, set all the relevant control values.
                updateMorph();

                // Perform all the voices for all the active presets.
                var i, N, v;
                for (i = 0, N = data.voices.length; i < N; ++i) {
                    v = data.voices[i];
                    if (v) {
                        genBeat(v, clock, lastTickTime_secs);
                    }
                }

                // Do the callback if specified.
                if (onGridTick) {
                    onGridTick(clock);
                }
            }
        }

        var kVoiceControlsToMorph = [
            'straight', 'offbeat', 'funk', 'phase', 'random', 
            'ramp', 'threshold', 'mean', 'cycleWeight', 'volume', 'pan'
        ];

        // Utility to calculate a weighted sum.
        // 
        // weights is an array of weights. Entries can include 'undefined',
        // in which case they'll not be included in the weighted sum.
        //
        // value_getter is function (i) -> value
        // result_transform(value) is applied to the weighted sum before 
        // returning the result value.
        function morphedValue(weights, value_getter, result_transform) {
            var result = 0, wsum = 0;
            var i, N, val;
            for (i = 0, N = weights.length; i < N; ++i) {
                if (weights[i] !== undefined) {
                    val = value_getter(i);
                    if (val !== undefined) {
                        result += weights[i] * val;
                        wsum += weights[i];
                    }
                }
            }
            return result_transform ? result_transform(result / wsum) : result / wsum;
        }

        // Something about the morph status changed.
        // Update the parameters of all the voices to reflect
        // the change.
        function updateMorph() {
            var i, N;
            if (morphEnabled && morphNeedsUpdate && data.presets.length > 1) {

                // Compute morph distances for each preset.
                var morphWeights = [], dx, dy, ps;
                for (i = 0, N = data.presets.length; i < N; ++i) {
                    ps = data.presets[i];
                    if (ps && ps.useInMorph) {
                        dx = data.morpher.x - data.presets[i].pos.x;
                        dy = data.morpher.y - data.presets[i].pos.y;
                        morphWeights[i] = 1 / (1 + Math.sqrt(dx * dx + dy * dy));
                    }
                }

                // For each voice, compute the morph.
                var wsum = 0, wnorm = 1, p, pN, w, c, cN, v;

                // Normalize the morph weights.
                wsum = morphedValue(morphWeights, function (p) { return 1; });
                wnorm = 1 / wsum; // WARNING: Divide by zero?

                // For each voice and for each control in each voice, do the morph.
                for (i = 0, N = data.voices.length; i < N; ++i) {
                    for (c = 0, cN = kVoiceControlsToMorph.length, v = data.voices[i]; c < cN; ++c) {
                        v[kVoiceControlsToMorph[c]] = morphedValue(morphWeights, function (p) { 
                            var ps = data.presets[p];
                            return i < ps.voices.length ? ps.voices[i][kVoiceControlsToMorph[c]] : undefined;
                        });
                    }
                }

                // Now morph the tempo. We morph the tempo in the log domain.
                data.clock.tempo_bpm = morphedValue(morphWeights, function (p) { return Math.log(data.presets[p].clock.tempo_bpm); }, Math.exp);

                // Morph the cycle length.
                data.clock.cycleLength = Math.round(morphedValue(morphWeights, function (p) { return data.presets[p].clock.cycleLength; }));
        
                if (onMorphUpdate) {
                    setTimeout(onMorphUpdate, 0);
                }

                morphNeedsUpdate = false;
                --morphEnabled;
            }
        }

        // We store info about all the presets as a JSON string in
        // a single key in localStorage.
        var storageKey = 'com.nishabdam.PeteKellock.RhythmEngine.' + name + '.data';

        // Loads the previous engine state saved in localStorage.
        function load(delegate) {
            var dataStr = window.localStorage[storageKey];
            if (dataStr) {
                loadFromStr(dataStr, delegate);
            } else {
                alert("RhythmEngine: load error");
            }
        }

        // Loads an engine state saved as a string from, possibly, an 
        // external source.
        function loadFromStr(dataStr, delegate) {
            try {
                data = JSON.parse(dataStr);
            } catch (e) {
                setTimeout(function () {
                    delegate.onError("Corrupt rhythm engine snapshot file.");
                }, 0);
                return;
            }

            var work = {done: 0, total: 0};

            function reportProgress(changeInDone, changeInTotal, desc) {
                work.done += changeInDone;
                work.total += changeInTotal;
                if (delegate.progress) {
                    delegate.progress(work.done, work.total, desc);
                }
            }

            reportProgress(0, data.kits.length * 10);

            kitNames = [];

            data.kits.forEach(function (kitInfo) {
                SampleManager.loadSampleSet(kitInfo.name, kitInfo.url, {
                    didFetchMappings: function (name, mappings) {
                        reportProgress(0, getKeys(mappings).length * 2);
                    },
                    didLoadSample: function (name, key) {
                        reportProgress(1, 0);
                    },
                    didDecodeSample: function () {
                        reportProgress(1, 0);
                    },
                    didFinishLoadingSampleSet: function (name, sset) {
                        kitNames.push(name);

                        // Save the drum names.
                        kitInfo.drums = getKeys(sset);

                        reportProgress(10, 0);

                        if (kitNames.length === data.kits.length) {
                            // We're done.
                            delegate.didLoad();
                            clockTick();
                        }
                    }
                });
            });
        }

        // This is for loading the JSON string if the user 
        // gives it by choosing an external file.
        function loadExternal(fileData, delegate, dontSave) {
            if (checkSnapshotFileData(fileData, delegate)) {
                loadFromStr(fileData, {
                    progress: delegate.progress,
                    didLoad: function () {
                        if (!dontSave) {
                            save();
                        }
                        delegate.didLoad();
                    }
                });
            }
        }

        // A simple check for the starting part of a snapshot file.
        // This relies on the fact that browser javascript engines
        // enumerate an object's keys in the same order in which they
        // were inserted into the object.
        function checkSnapshotFileData(fileData, delegate) {
            var valid = (fileData.indexOf('{"type":"pk_rhythm_engine"') === 0);
            if (!valid) {
                setTimeout(function () {
                    delegate.onError("This is not a rhythm engine snapshot file.");
                }, 0);
            }
            return valid;
        }

        // Loads settings from file with given name, located in
        // the "settings" folder.
        function loadFile(filename, delegate) {
            if (filename && typeof(filename) === 'string') {
                fs.root.getDirectory("settings", {create: true},
                        function (settingsDir) {
                            settingsDir.getFile(filename, {create: false},
                                function (fileEntry) {
                                    fileEntry.file(
                                        function (f) {
                                            var reader = new global.FileReader();

                                            reader.onloadend = function () {
                                                loadExternal(reader.result, delegate, true);
                                            };
                                            reader.onerror = delegate && delegate.onError;

                                            reader.readAsText(f);
                                        },
                                        delegate && delegate.onError
                                    );
                                },
                                delegate && delegate.onError
                            );
                        },
                        delegate && delegate.onError
                    );
            } else {
                load(delegate);
            }
        }

        // Makes an array of strings giving the names of saved
        // settings and calls delegate.didListSettings(array)
        // upon success. delegate.onError is called if there is
        // some error.
        function listSavedSettings(delegate) {
            fs.root.getDirectory("settings", {create: true},
                    function (settingsDir) {
                        var reader = settingsDir.createReader();
                        var result = [];

                        function readEntries() {
                            reader.readEntries(
                                function (entries) {
                                    var i, N;

                                    if (entries.length === 0) {
                                        // We're done.
                                        delegate.didListSettings(result.sort());
                                    } else {
                                        // More to go. Accumulate the names.
                                        for (i = 0, N = entries.length; i < N; ++i) {
                                            result.push(entries[i].name);
                                        }

                                        // Continue listing the directory.
                                        readEntries();
                                    }
                                },
                                delegate && delegate.onError
                            );
                        }

                        readEntries();
                    },
                    delegate && delegate.onError
                );
        }

        // Saves all the presets in local storage.
        function save(filename, delegate) {
            var dataAsJSON = JSON.stringify(data);

            // First save a copy in the locaStorage for worst case scenario.
            window.localStorage[storageKey] = dataAsJSON;

            if (filename && typeof(filename) === 'string') {
                fs.root.getDirectory("settings", {create: true},
                        function (settingsDir) {
                            settingsDir.getFile(filename, {create: true},
                                function (f) {
                                    f.createWriter(
                                        function (writer) {
                                            writer.onwriteend = delegate && delegate.didSave;
                                            writer.onerror = delegate && delegate.onError;

                                            var bb = new global.BlobBuilder();
                                            bb.append(dataAsJSON);
                                            writer.write(bb.getBlob());
                                        },
                                        delegate && delegate.onError
                                        );
                                },
                                delegate && delegate.onError
                                );
                        },
                        delegate && delegate.onError
                        );
            }
        }

        // Make a "voice" object exposing all the live-tweakable
        // parameters. The API user can just set these parameters
        // to hear immediate effect in the RE's output.
        function make_voice(kit, drum) {
            return {
                voice: {kit: kit, drum: drum},
                straight: 0.5,
                offbeat: 0.0,
                funk: 0.0,
                phase: 0,
                random: 0.0,
                ramp: 0.2,
                threshold: 0.5,
                mean: 0.5,
                cycleWeight: 0.2,
                volume: 1.0,
                pan: 0.0
            };
        }

        function validatePresetIndex(p, extra) {
            if (p < 0 || p >= data.presets.length + (extra ? extra : 0)) {
                throw new Error('Invalid preset index!');
            }
        }

        return {
            kits: data.kits, // Read-only.
            save: save,
            snapshot: function () { return JSON.stringify(data); },
            load: loadFile,
            list: listSavedSettings,
            import: loadExternal,

            // You can set a callback to be received on every grid tick so
            // that you can do something visual about it. The callback will
            // receive the current clock status as the sole argument.
            // The callback is expected to not modify the clock.
            get onGridTick() { return onGridTick; },
            set onGridTick(newCallback) { onGridTick = newCallback; },

            // You can set a callback for notification whenever the bulk
            // of sliders have been changed due to a morph update.
            get onMorphUpdate() { return onMorphUpdate; },
            set onMorphUpdate(newCallback) { onMorphUpdate = newCallback; },

            // Change the tempo by assigning to tempo_bpm field.
            get tempo_bpm() {
                return data.clock.tempo_bpm;
            },
            set tempo_bpm(new_tempo_bpm) {
                data.clock.tempo_bpm = Math.min(Math.max(10, new_tempo_bpm), 480);
            },

            // Info about the voices and facility to add more.
            numVoices: function () { return data.voices.length; },
            voice: function (i) { return data.voices[i]; },
            addVoice: function (kit, drum) {
                var voice = make_voice(kit || 'acoustic-kit', drum || 'kick');
                data.voices.push(voice);
                return voice;
            },

            // Info about presets and the ability to add/save to presets.
            numPresets: function () { return data.presets.length; },
            preset: function (p) { return data.presets[p]; },
            saveAsPreset: function (p) {
                validatePresetIndex(p, 1);

                p = Math.min(data.presets.length, p);

                // Either make a new preset or change a saved one.
                // We preserve a preset's morph weight if we're
                // changing one to a new snapshot.
                var old = (p < data.presets.length ? data.presets[p] : {pos: {x: 0, y: 0}});
                data.presets[p] = {
                    useInMorph: old.useInMorph,
                    pos: copy_object(old.pos),
                    clock: copy_object(data.clock),
                    voices: copy_object(data.voices)
                };
            },


            // Morphing functions. The initial state of the morpher is "disabled",
            // so as long as that is the case, none of the 2D position functions
            // have any effect. You first need to enable the morpher before
            // the other calls have any effect.
            enableMorph: function (flag) {
                morphEnabled += flag ? 1 : 0;
                if (flag) {
                    morphNeedsUpdate = true;
                }
            },
            presetPos: function (p) { return data.presets[p].pos; },
            changePresetPos: function (p, x, y) {
                validatePresetIndex(p);
                var pos = data.presets[p].pos;
                pos.x = x;
                pos.y = y;
                morphNeedsUpdate = true;
            },
            morpherPos: function () { return data.morpher; },
            changeMorpherPos: function (x, y) {
                data.morpher.x = x;
                data.morpher.y = y;
                morphNeedsUpdate = true;
            },

            // Starting and stopping the engine. Both methods are
            // idempotent.
            get running() { return data.clock.running; },
            start: function () {
                if (!data.clock.running) {
                    data.clock.running = true;
                    clockLastTime_secs = undefined;
                    clockJSN = theAudioContext.createJavaScriptNode(512, 0, 1);
                    clockJSN.onaudioprocess = function (event) {
                        clockTick();
                    };
                    clockJSN.connect(theAudioContext.destination);
                }
            },
            stop: function () {
                data.clock.running = false;
                if (clockJSN) {
                    clockJSN.disconnect();
                    clockJSN = undefined;
                }
            }
        };
    }

    // drumKits can be null, in which case all known drum kits
    // will be loaded.
    //
    // root_url is the url (without the trailing slash) under
    // which the drum kits are located. Note that since 
    // XMLHttpRequest is used to load the drum kits, you must
    // pass a domain-local url here.
    //
    // delegate is an object whose methods get called
    // at various times -
    //      didInitialize: function (RhythmEngine) {...}
    //      Called once initialization finishes and passes the 
    //      RhythmEngine module (which you can ignore for the
    //      moment). You MUST specify this callback. Otherwise
    //      you won't know when initialization finishes and might
    //      do something stupid in the meanwhile.
    //
    //      progress: function (done, total) {...}
    //      (Optional) Called when some part of the initialization
    //      task completed. Percentage finished is given by done/total.
    //      
    //      onError: function (e) {...}
    //      Called when the unexpected happens. e will be an Error object.
    //      
    function initRE(drumKits, root_url, delegate) {
        var options = {};
        var e;
        var loadedKitNames = [];

        drumKits = drumKits || availableKits;

        SampleManager.init(100, {
            didInitialize: function (sm) {
                theAudioContext = options.audioContext;
                if (!theAudioContext) {
                    e = new Error('Web Audio API could not be initialized.');
                    if (delegate.onError) {
                        delegate.onError(e);
                        return;
                    } else {
                        throw e;
                    }
                }

                var work = {done: 0, total: 0};

                function reportProgress(changeInDone, changeInTotal) {
                    work.done += changeInDone;
                    work.total += changeInTotal;
                    if (delegate.progress) {
                        delegate.progress(work.done, work.total);
                    }
                }

                // Reuse the filesystem object.
                fs = options.fileSystem;

                reportProgress(0, drumKits.length * 10);

                drumKits.forEach(function (kit) {
                    sm.loadSampleSet(kit, root_url + '/' + kit, {
                        didFetchMappings: function (name, mappings) {
                            reportProgress(0, getKeys(mappings).length * 2);
                        },
                        didLoadSample: function () {
                            reportProgress(1, 0);
                        },
                        didDecodeSample: function () {
                            reportProgress(1, 0);
                        },
                        didFinishLoadingSampleSet: function (name, sset) {
                            console.log('Loaded drum kit [' + name + ']');
                            loadedKitNames.push(name);
                            availableKitInfos[name] = {name: name, url: root_url + '/' + kit, samples: sset};

                            reportProgress(10, 0);

                            if (loadedKitNames.length === drumKits.length) {
                                // All loading complete.
                                nextFrame(function () {
                                    delegate.didInitialize(RhythmEngine, loadedKitNames, availableKitInfos);
                                });
                            }
                        }
                    });
                });
            }
        }, options);
    }

    exports.init = initRE;
    exports.create = newRE;

    return exports;
}({}, window, window.Math));

return RhythmEngine;
});
