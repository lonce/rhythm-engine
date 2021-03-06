# Pete Kellock's Rhythm Engine

The _Rhythm Engine_ is a presentation of a continuous multi-dimensional
rhythmic space, originally designed by Pete Kellock in the mid nineties at ISS,
Singapore.

The engine performs rhythms using a number of _voices_, each playing
the role of a single drum. What each voice does can be controlled by a bunch of
continuous sliders. A number of voices playing a few different drums can make
interesting rhythm patterns that you can manipulate at a high level using this
interface.

## Presets and the morpher

When you arrive at a set of voices and slider settings for them that you like,
you can save it in one of the "presets".  Just click on one of them.

The presets you store can be used in the "morpher" and you can explore the
space _between_ your presets by manipulating the red handle in the
morpher.

You can drag any green preset into a morph to include it in the mix. To remove
it, shift-click on the preset within the morpher. Thereafter, while the rhythm
is playing, you can manipulate the red morpher handle to move in the space
between your presets in a limited way (it's a 2D morpher after all).

## Voice controls

A very brief description of the controls follow. This is just a rough guide.
Have fun playing with them and figuring out how to make interesting stuff with
them instead of reading this :)

1. **phase** - Time shifts the pattern being generated by the voice according
   to a sense of "progressive weirdness". 

2. **straight** - Increasing this will result in a normal straight 4/4 kind of
   beat pattern.

3. **offbeat** - Increasing this will cause strokes on cycle times that are
   offbeat relative to the "straight" pattern.

4. **funk** - A pattern of the form 3+3+3+3+2+2.

5. **random** - Amount of randomness in the pattern.

6. **ramp** - Increasing this will cause the voice to ramp up during the cycle.

7. **threshold** - The above sliders determine the "strike velocity" of the
   drum.  This parameter specifies which values of the resultant velocity will
   be discarded. Only values above this threshold will be audible.

8. **volume** - Am ordinary volume control on the voice.

## Technical info

This implementation makes use of a bunch of bleeding edge browser technologies.
Frankly, it is a pleasure to see all these work together fairly well and I
didn't bleed all that much.

1. The Web Audio API for all the sound heavy lifting.
2. 2D Canvas API for the slider and morpher controls.
3. `window.localStorage`
4. FileSystem and Quota APIs for cached drum sample storage.
5. Drag-n-drop API for working with presets.
6. `requestAnimationFrame` for timing, though this is temporary. It
   doesn't provide enough audio accuracy and I'll likely switch to a
   JavascriptAudioNode to do the timing instead.

## TODO

This implementation doesn't include all elements of the original Rhythm Engine.
Here's what's been left out.

1. Swing parameter.
2. Time signature needs to be exposed in the UI.
3. Simple/Comound time structure needs to be exposed in the UI.
4. Chords! The engine is most fun when it also plays chord patterns and I need
   instrument samples for use with the web audio api. (rant)Damn, some things
   are just easier with MIDI.(/rant)
5. Lonce Wyse has made some improvements to the RE in the area of swing. Yet to
   incorporate those.
6. The morpher won't work with only one preset in the scene. This situation was
   called "z-morphing" or "morphing to zero" in the original RE. This is to be
   handled with everything going to zero as the morpher gets more distant from
   the sole preset (plus a few details). That isn't implemented yet.
