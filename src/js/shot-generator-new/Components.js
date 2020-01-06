const THREE = require('three')

const { ipcRenderer, remote } = require('electron')
const { dialog } = remote
const fs = require('fs-extra')
const path = require('path')

const React = require('react')

const { useState, useEffect, useRef, useContext, useMemo, useCallback } = React
const {useDrag} = require('react-use-gesture')
const { connect } = require('react-redux')
const Stats = require('stats.js')
const { VariableSizeList } = require('react-window')
const classNames = require('classnames')
const prompt = require('electron-prompt')

const { createSelector } = require('reselect')

const h = require('../utils/h')
const useComponentSize = require('../hooks/use-component-size')
const useLongPress = require('../hooks/use-long-press')

const CameraControls = require('./CameraControls')

const throttle = require('lodash.throttle')

//const robot = require("robotjs")

const {
  //
  //
  // action creators
  //
  selectObject,
  selectObjectToggle,

  // createObject,
  updateObject,
  deleteObjects,
  groupObjects,
  ungroupObjects,
  mergeGroups,

  duplicateObjects,

  selectBone,
  setMainViewCamera,
  // loadScene,
  // saveScene,
  updateCharacterSkeleton,
  setActiveCamera,
  setCameraShot,
  // resetScene,
  // createScenePreset,
  // updateScenePreset,
  // deleteScenePreset,

  createCharacterPreset,

  // createPosePreset,
  // updatePosePreset,
  // deletePosePreset,

  updateWorld,
  updateWorldRoom,
  updateWorldEnvironment,
  updateWorldFog,
  updateObjects,

  // markSaved,

  toggleWorkspaceGuide,
  undoGroupStart,
  undoGroupEnd,

  //
  //
  // selectors
  //
  // getSerializedState,
  // getIsSceneDirty,

  getSceneObjects,
  getSelections,
  getActiveCamera,
  getSelectedBone,
  getWorld,

  initialState
//} = require('../state')
} = require('../shared/reducers/shot-generator')

const Icon = require('./Icon')

const presetsStorage = require('../shared/store/presetsStorage')
//const presetsStorage = require('../presetsStorage')

const ModelLoader = require('../services/model-loader')

const ColorSelect = require('./ColorSelect')
const Select = require('./components/Select').default

const ModelSelect = require('./components/ModelSelect').default
const AttachmentsSelect = require('./AttachmentsSelect')
//const PosePresetsEditor = require('./PosePresetsEditor')
const PosePresetsEditor = require('./components/PosePresetsEditor').default
const AttachableEditor = require('./components/AttachableEditor').default
//const AttachableEditor = require('./attachables/AttachableEditor')
const AttachableInfo = require('./attachables/AttachableInfo')
const HandPresetsEditor = require('./HandPresetsEditor')
// const ServerInspector = require('./ServerInspector')
const MultiSelectionInspector = require('./MultiSelectionInspector')
const CustomModelHelpButton = require('./CustomModelHelpButton')

const ItemList = require('./components/ItemList').default
const InspectedWorld = require('./components/InspectedWorld').default
const InspectedElement = require('./components/InspectedElement').default
const {NumberSlider, transforms: NumberSliderTransform, formatters: NumberSliderFormatter} = require('./components/NumberSlider')

const {setShot, ShotSizes, ShotAngles} = require('./cameraUtils')


window.THREE = THREE

// const draggables = (sceneObjects, scene) =>
//   //scene.children.filter(o => o.userData.type === 'object' || o instanceof BoundingBoxHelper)
//   scene.children.filter(o => o.userData.type === 'object' ||
//                               o.userData.type === 'character' ||
//                               o.userData.type === 'light' ||
//                               o.userData.type === 'volume' )

// const cameras = ( scene ) =>
//   scene.children.filter(o => o instanceof THREE.PerspectiveCamera)

const animatedUpdate = (fn) => (dispatch, getState) => fn(dispatch, getState())

// TODO dry
const metersAsFeetAndInches = meters => {
  let heightInInches = meters * 39.3701
  let heightFeet = Math.floor(heightInInches / 12)
  let heightInches = Math.floor(heightInInches % 12)
  return [heightFeet, heightInches]
}

const feetAndInchesAsString = (feet, inches) => `${feet}′${inches}″`

const shortId = id => id.toString().substr(0, 7).toLowerCase()

const preventDefault = (fn, ...args) => e => {
  e.preventDefault()
  fn(e, ...args)
}

/**
 * Return the first index containing an *item* which is greater than *item*.
 * @arguments _(item)_
 * @example
 *  indexOfGreaterThan([10, 5, 77, 55, 12, 123], 70) // => 2
 * via mohayonao/subcollider
 */
const indexOfGreaterThan = (array, item) => {
  for (var i = 0, imax = array.length; i < imax; ++i) {
    if (array[i] > item) { return i }
  }
  return -1
}
/**
 * Returns the closest index of the value in the array (collection must be sorted).
 * @arguments _(item)_
 * @example
 *  indexIn([2, 3, 5, 6], 5.2) // => 2
 * via mohayonao/subcollider
 */
 const indexIn = (array, item) => {
  var i, j = indexOfGreaterThan(array, item)
  if (j === -1) { return array.length - 1 }
  if (j ===  0) { return j }
  i = j - 1
  return ((item - array[i]) < (array[j] - item)) ? i : j
}

const SceneContext = React.createContext()



require('../vendor/three/examples/js/loaders/GLTFLoader')
require('../vendor/three/examples/js/loaders/OBJLoader2')
const loadingManager = new THREE.LoadingManager()
const objLoader = new THREE.OBJLoader2(loadingManager)
const gltfLoader = new THREE.GLTFLoader(loadingManager)
objLoader.setLogging(false, false)
THREE.Cache.enabled = true

const Inspector = ({
  world,
  kind, data,
  models, updateObject, deleteObjects,
  machineState, transition,
  selectedBone,
  selectBone,
  updateCharacterSkeleton,
  updateWorld,
  updateWorldRoom,
  updateWorldEnvironment,
  updateWorldFog,
  storyboarderFilePath,
  selections
}) => {
  const { scene } = useContext(SceneContext)

  const ref = useRef()

  const onFocus = event => transition('TYPING_ENTER')
  const onBlur = event => transition('TYPING_EXIT')

  let sceneObject = data
  let isGroup = sceneObject && sceneObject.type === 'group'
  let selectedCount = isGroup ? sceneObject.children.length + 1 : selections.length

  // try to exit typing if there is nothing to inspect
  useEffect(() => {
    if (!data) transition('TYPING_EXIT')
  }, [data])

  useEffect(() => {
    // automatically blur if typing mode was exited but a child of ours is focused
    if (!machineState.matches('typing')) {
      if (document.hasFocus()) {
        const el = document.activeElement
        if (ref.current.contains(el)) {
          el.blur()
        }
      }
    }
  }, [machineState])

  return h([
    'div#inspector',
    { ref, onFocus, onBlur },
    (selectedCount > 1)
      ? [
          MultiSelectionInspector
        ]
      : (kind && data)
        ? [
            /*InspectedElement, {
              sceneObject,
              models,
              updateObject,
              selectedBone: scene.getObjectByProperty('uuid', selectedBone),
              machineState,
              transition,
              selectBone,
              updateCharacterSkeleton,
              storyboarderFilePath
            }*/
          InspectedElement, {element: (
              <InspectedElementOld {...{
                sceneObject,
                models,
                updateObject,
                selectedBone: scene.getObjectByProperty('uuid', selectedBone),
                machineState,
                transition,
                selectBone,
                updateCharacterSkeleton,
                storyboarderFilePath
              }}/>
            )}
          ]
        : [
          InspectedWorld
        ]
  ])
}

const ElementsPanel = connect(
  // what changes should we watch for to re-render?
  state => ({
    world: getWorld(state),
    sceneObjects: getSceneObjects(state),
    selections: getSelections(state),
    selectedBone: getSelectedBone(state),
    models: state.models,
    activeCamera: getActiveCamera(state),

    storyboarderFilePath: state.meta.storyboarderFilePath
  }),
  // what actions can we dispatch?
  {
    selectObject,
    selectObjectToggle,
    updateObject,
    deleteObjects,
    setActiveCamera,
    selectBone,
    updateCharacterSkeleton,
    updateWorld,
    updateWorldRoom,
    updateWorldEnvironment,
    updateWorldFog,
    undoGroupStart,
    undoGroupEnd
  }
)(
  React.memo(({ world, sceneObjects, models, selections, selectObject, selectObjectToggle, updateObject, deleteObjects, selectedBone, machineState, transition, activeCamera, setActiveCamera, selectBone, updateCharacterSkeleton, updateWorld, updateWorldRoom, updateWorldEnvironment, updateWorldFog, storyboarderFilePath }) => {
    let kind = sceneObjects[selections[0]] && sceneObjects[selections[0]].type
    let data = sceneObjects[selections[0]]
    
    return (
        <div style = {{flex: 1, display: 'flex', flexDirection: 'column'}} >
          <div id='listing'>
            <ItemList/>
          </div>
          <Inspector
              {...{
                world,

                kind,
                data,

                models, updateObject,

                machineState, transition,

                selectedBone, selectBone,

                updateCharacterSkeleton,

                updateWorld,
                updateWorldRoom,
                updateWorldEnvironment,
                updateWorldFog,

                storyboarderFilePath,

                selections
              }}
          />
        </div>
    )
  }
))

const LabelInput = ({ label, setLabel, onFocus, onBlur }) => {
  const [editing, setEditing] = useState(false)
  const ref = useRef(null)

  const onStartEditingClick = event => {
    setEditing(true)
  }

  const onSetLabelClick = event => {
    let value = ref.current.value
    if (value != null && value.length) {
      setLabel(value)
      setEditing(false)
    } else {
      setLabel(null)
      setEditing(false)
    }
    onBlur()
  }

  useEffect(() => {
    if (ref.current) {
      ref.current.focus()
      ref.current.select()
    }
  }, [editing, ref.current])

  return h(
    editing
      ? [
          'form',
          {
            onFocus,
            onBlur,

            style: {
              margin: '6px 0 12px 0'
            },
            onSubmit: preventDefault(onSetLabelClick),
          },
          [
            'input',
            {
              ref,
              style: {
                padding: 6
              },
              defaultValue: label
            }
          ],
          [
            'button',
            {
              style: {
                fontSize: 14,
                padding: 6,
                margin: '0 0 0 6px'
              }
            },
            'set'
          ]
        ]
      : [
          'a[href=#][className=object-property-heading]',
          {
            onClick: preventDefault(onStartEditingClick)
          },
          label + ' Properties'
        ]
  )
}

const saveCharacterPresets = state => presetsStorage.saveCharacterPresets({ characters: state.presets.characters })

const CharacterPresetsEditor = connect(
  state => ({
    characterPresets: state.presets.characters,
    models: state.models
  }),
  {
    updateObject,
    selectCharacterPreset: (sceneObject, characterPresetId, preset) => (dispatch, getState) => {
      dispatch(updateObject(sceneObject.id, {
        // set characterPresetId
        characterPresetId,

        // apply preset values to character model
        height: preset.state.height,
        //height: state.models[preset.state.model].baseHeight,
        model: preset.state.model,
        // gender: 'female',
        // age: 'adult'

        headScale: preset.state.headScale,
        tintColor: preset.state.tintColor,

        morphTargets: {
          mesomorphic: preset.state.morphTargets.mesomorphic,
          ectomorphic: preset.state.morphTargets.ectomorphic,
          endomorphic: preset.state.morphTargets.endomorphic
        },

        name: sceneObject.name || preset.name
      }))
    },
    createCharacterPreset: ({ id, name, sceneObject }) => (dispatch, getState) => {
      // add the character data to a named preset
      let preset = {
        id,
        name,
        state: {
          height: sceneObject.height,
          //height: sceneObject.model.originalHeight,

          model: sceneObject.model,
          // gender: 'female',
          // age: 'adult'

          headScale: sceneObject.headScale,
          tintColor: sceneObject.tintColor,

          morphTargets: {
            mesomorphic: sceneObject.morphTargets.mesomorphic,
            ectomorphic: sceneObject.morphTargets.ectomorphic,
            endomorphic: sceneObject.morphTargets.endomorphic
          }
        }
      }

      // start the undo-able operation
      dispatch(undoGroupStart())

      // create the preset
      dispatch(createCharacterPreset(preset))

      // save the presets file
      saveCharacterPresets(getState())

      // update this object to use the preset
      dispatch(updateObject(sceneObject.id, {
        // set the preset id
        characterPresetId: id,
        // use the preset’s name (if none assigned)
        name: sceneObject.name || preset.name
      }))

      // end the undo-able operation
      dispatch(undoGroupEnd())
    }
  }
)(
  // TODO could optimize by only passing sceneObject properties we actually care about
  React.memo(({ sceneObject, characterPresets, selectCharacterPreset, createCharacterPreset }) => {
    const onCreateCharacterPresetClick = event => {
      // show a prompt to get the desired preset name
      let id = THREE.Math.generateUUID()
      prompt({
        title: 'Preset Name',
        label: 'Select a Preset Name',
        value: `Character ${shortId(id)}`
      }, require('electron').remote.getCurrentWindow()).then(name => {
        if (name != null && name != '' && name != ' ') {
          createCharacterPreset({
            id,
            name,
            sceneObject
          })
        }
      }).catch(err => {
        console.error(err)
      })
    }

    const onSelectCharacterPreset = event => {
      let characterPresetId = event.target.value
      let preset = characterPresets[characterPresetId]
      selectCharacterPreset(sceneObject, characterPresetId, preset)
    }

    return h(
      ['div.row', { style: { margin: '9px 0 6px 0', paddingRight: 0 } }, [
        ['div', { style: { width: 50, display: 'flex', alignSelf: 'center' } }, 'preset'],
        [
          'select', {
            required: true,
            value: sceneObject.characterPresetId || '',
            onChange: preventDefault(onSelectCharacterPreset),
            style: {
              flex: 1,
              marginBottom: 0,
              maxWidth: 192
            }
          }, [
              ['option', { value: '', disabled: true }, '---'],
              Object.values(characterPresets).map(preset =>
                ['option', { value: preset.id }, preset.name]
              )
            ]
          ]
        ],
        ['a.button_add[href=#]', { style: { marginLeft: 6 }, onClick: preventDefault(onCreateCharacterPresetClick) }, '+']
      ]
    )
  })
)

const CHARACTER_HEIGHT_RANGE = {
  character: { min: 1.4732, max: 2.1336 },
  child: { min: 1.003, max: 1.384 },
  baby: { min: 0.492, max: 0.94 }
}

const MORPH_TARGET_LABELS = {
  'mesomorphic': 'Muscular',
  'ectomorphic': 'Skinny',
  'endomorphic': 'Obese',
}
const InspectedElementOld = ({ sceneObject, updateObject, selectedBone, machineState, transition, selectBone, updateCharacterSkeleton, storyboarderFilePath  }) => {
  const createOnSetValue = (id, name, transform = value => value) => value => updateObject(id, { [name]: transform(value) })
  const { scene } = useContext(SceneContext)
  let positionSliders = [
    [NumberSlider, { label: 'x', value: sceneObject.x, min: -30, max: 30, onSetValue: createOnSetValue(sceneObject.id, 'x') } ],
    [NumberSlider, { label: 'y', value: sceneObject.y, min: -30, max: 30, onSetValue: createOnSetValue(sceneObject.id, 'y') } ],
    [NumberSlider, { label: 'z', value: sceneObject.z, min: -30, max: 30, onSetValue: createOnSetValue(sceneObject.id, 'z') } ],
  ]

  let volumeSliders = (sceneObject.model === 'box' )
    ? [
        [NumberSlider, { label: 'width', value: sceneObject.width, min: 0.025, max: 5, onSetValue: createOnSetValue(sceneObject.id, 'width') } ],
        [NumberSlider, { label: 'height', value: sceneObject.height, min: 0.025, max: 5, onSetValue: createOnSetValue(sceneObject.id, 'height') } ],
        [NumberSlider, { label: 'depth', value: sceneObject.depth, min: 0.025, max: 5, onSetValue: createOnSetValue(sceneObject.id, 'depth') } ]
      ]
    : [
        NumberSlider, {
          label: 'size',
          value: sceneObject.depth,
          min: 0.025,
          max: 5,
          onSetValue: value => updateObject(
            sceneObject.id,
            { width: value, height: value, depth: value }
          )
        }
      ]

  const onFocus = event => transition('TYPING_ENTER')
  const onBlur = event => transition('TYPING_EXIT')
  const heightRange =
    sceneObject.type == 'character' && !ModelLoader.isCustomModel(sceneObject.model)
      ? ['adult', 'teen'].some(el => sceneObject.model.includes(el))
        ? CHARACTER_HEIGHT_RANGE['character']
        : CHARACTER_HEIGHT_RANGE[sceneObject.model]
      : undefined

  return h([
    'div',
      [
        LabelInput,
        {
          key: sceneObject.id,
          label: sceneObject.name != null
            ? sceneObject.name
            : sceneObject.displayName,
          onFocus,
          onBlur,
          setLabel: name => {
            updateObject(sceneObject.id, { name })
          }
        }
      ],

      // character preset
      sceneObject.type == 'character' && [
        [CharacterPresetsEditor, { sceneObject }],
      ],

      sceneObject.type != 'camera' &&
        [
          'div.row',
          { style: { alignItems: 'center' } }, [

            // ['div', { style: { width: 50 } }, 'visible'],

            // ['input', {
            //   type: 'checkbox',
            //   checked: sceneObject.visible,
            //   readOnly: true
            // }],

            ['label', {
              onClick: preventDefault(event => {
                if (sceneObject.type === 'character') {
                  selectBone(null)
                }
                updateObject(sceneObject.id, { visible: !sceneObject.visible })
              }),
            }, [
              'span'
            ]]
          ]
        ],

      [
        'div.column',
        positionSliders
      ],

      (sceneObject.type == 'object' ) && [
        [
          'div.column',
          volumeSliders
        ],
      ],

      (sceneObject.type == 'image' ) && [
        [
          NumberSlider, {
            label: 'size',
            value: sceneObject.height,
            min: 0.025,
            max: 5,
            onSetValue: value => updateObject(
              sceneObject.id,
              { height: value }
            )
          }
        ]
      ],

      sceneObject.type == 'volume' && [
        [
          'div.column',

          [NumberSlider, { label: 'width', value: sceneObject.width, min: 0.1, max: 25, onSetValue: createOnSetValue(sceneObject.id, 'width') } ],
          [NumberSlider, { label: 'height', value: sceneObject.height, min: -25, max: 25, onSetValue: createOnSetValue(sceneObject.id, 'height') } ],
          [NumberSlider, { label: 'depth', value: sceneObject.depth, min: 0.1, max: 25, onSetValue: createOnSetValue(sceneObject.id, 'depth') } ],

          ['div.number-slider', [
            ['div.number-slider__label', 'Layer Image Files'],
            ['div.number-slider__control', { style: { width: 137 }}, [
              AttachmentsSelect, {
                style: { flex: 1 },

                ids: sceneObject.volumeImageAttachmentIds,
                options: [
                  { name: 'rain', value: 'rain1,rain2' },
                  { name: 'fog', value: 'fog1,fog2' },
                  { name: 'explosion', value: 'debris,explosion' }
                ],
                copyFiles: filepaths => {
                  let projectDir = path.dirname(storyboarderFilePath)
                  let assetsDir = path.join(projectDir, 'models', 'volumes')
                  fs.ensureDirSync(assetsDir)

                  let dsts = []
                  for (let src of filepaths) {
                    let dst = path.join(assetsDir, path.basename(src))
                    console.log('copying from', src, 'to', dst)
                    try {
                      fs.copySync(src, dst)
                      dsts.push(dst)
                    } catch (err) {
                      console.error('could not copy', src)
                      alert('could not copy ' + src)
                    }
                  }

                  let ids = dsts.map(filepath => path.relative(projectDir, filepath))
                  console.log('setting attachment ids', ids)

                  return ids
                },
                onChange: volumeImageAttachmentIds => {
                  updateObject(sceneObject.id, { volumeImageAttachmentIds })
                },
                onBlur: () => transition('TYPING_EXIT'),
                multiSelections: true
              }
            ]
          ]]],

          [NumberSlider, {
            label: 'layers',
            value: sceneObject.numberOfLayers,
            min: 1,
            max: 10,
            step: 1,
            transform: NumberSliderTransform.round,
            formatter: NumberSliderFormatter.identity,
            onSetValue: createOnSetValue(sceneObject.id, 'numberOfLayers')}],
          [NumberSlider, { label: 'opacity', value: sceneObject.opacity, min: 0, max: 1, onSetValue: createOnSetValue(sceneObject.id, 'opacity') } ],
          [NumberSlider, {
            label: 'color',
            value: sceneObject.color/0xFFFFFF,
            min: 0.0,
            max: 1,
            onSetValue: value => {
              let c = 0xFF * value
              let color = (c << 16) | (c << 8) | c
              updateObject(sceneObject.id, { color: color })
            }
          }]
        ],
      ],

      sceneObject.type == 'light' && [
        [
          'div.column',
          [NumberSlider, { label: 'intensity', value: sceneObject.intensity, min: 0.025, max: 1, onSetValue: createOnSetValue(sceneObject.id, 'intensity') } ],
        ],
        [
          'div.column',
          [NumberSlider, {
            label: 'angle',
            value: sceneObject.angle,
            min: 0.025,
            max: Math.PI/2,
            onSetValue: createOnSetValue(sceneObject.id, 'angle'),
            step: Math.PI/180,
            transform: NumberSliderTransform.radians,
            formatter: NumberSliderFormatter.radToDeg
           }]
        ],
        [
          'div.column',
          [NumberSlider, { label: 'distance', value: sceneObject.distance, min: 0.025, max: 100, onSetValue: createOnSetValue(sceneObject.id, 'distance') } ],
        ],
        [
          'div.column',
          [NumberSlider, { label: 'penumbra', value: sceneObject.penumbra, min: 0, max: 1, onSetValue: createOnSetValue(sceneObject.id, 'penumbra') } ],
        ],
        [
          'div.column',
          [NumberSlider, { label: 'decay', value: sceneObject.decay, min: 1, max: 2, onSetValue: createOnSetValue(sceneObject.id, 'decay') } ],
        ],
      ],

      sceneObject.type == 'object' || sceneObject.type == 'image'
        ? [
            ['div',
              [NumberSlider, {
                label: 'rotate x',
                min: -180,
                max: 180,
                step: 1,
                value: THREE.Math.radToDeg(sceneObject.rotation.x),
                onSetValue: value => updateObject(sceneObject.id, { rotation: { x: THREE.Math.degToRad(value) } }),
                transform: NumberSliderTransform.degrees,
                formatter: NumberSliderFormatter.degrees
              }]
            ],
            ['div',
              [NumberSlider, {
                label: 'rotate y',
                min: -180,
                max: 180,
                step: 1,
                value: THREE.Math.radToDeg(sceneObject.rotation.z),
                onSetValue: value => updateObject(sceneObject.id, { rotation: { z: THREE.Math.degToRad(value) } }),
                transform: NumberSliderTransform.degrees,
                formatter: NumberSliderFormatter.degrees
              }]
            ],
            ['div',
              [NumberSlider, {
                label: 'rotate z',
                min: -180,
                max: 180,
                step: 1,
                value: THREE.Math.radToDeg(sceneObject.rotation.y),
                onSetValue: value => updateObject(sceneObject.id, { rotation: { y: THREE.Math.degToRad(value) } }),
                transform: NumberSliderTransform.degrees,
                formatter: NumberSliderFormatter.degrees
              }]
            ]
          ]
        : ['div',
            [NumberSlider, {
              label: 'rotation',
              min: -180,
              max: 180,
              step: 1,
              value: THREE.Math.radToDeg(sceneObject.rotation),
              onSetValue: value => updateObject(sceneObject.id, { rotation: THREE.Math.degToRad(value) }),
              transform: NumberSliderTransform.degrees,
              formatter: NumberSliderFormatter.degrees
            }]
          ],

    sceneObject.type == 'object'
        ? ['div',
          [
            ColorSelect,
            {
              label: 'tint color',
              value: sceneObject.tintColor,
              onSetValue: createOnSetValue(sceneObject.id, 'tintColor')
            }
          ]
        ]
        : null,

      sceneObject.type == 'camera' &&
        ['div',
          [NumberSlider, {
            label: 'roll',
            min: -45,
            max: 45,
            step: 1,
            value: THREE.Math.radToDeg(sceneObject.roll),
            onSetValue: value => updateObject(sceneObject.id, { roll: THREE.Math.degToRad(value) }),
            transform: NumberSliderTransform.degrees,
            formatter: NumberSliderFormatter.degrees
          }]
        ],

      (sceneObject.type == 'camera' || sceneObject.type == 'light') &&
        ['div',
          [NumberSlider, {
            label: 'tilt',
            min: sceneObject.type == 'light' ? -180 : -90,
            max: sceneObject.type == 'light' ? 180 : 90,
            step: 1,
            value: THREE.Math.radToDeg(sceneObject.tilt),
            onSetValue: value => updateObject(sceneObject.id, { tilt: THREE.Math.degToRad(value) }),
            formatter: NumberSliderFormatter.degrees
          }]
        ],

      sceneObject.type == 'camera' &&
        [
          NumberSlider, {
            label: 'F.O.V.',
            min: 1,
            max: 120,
            step: 1,
            value: sceneObject.fov,
            onSetValue: createOnSetValue(sceneObject.id, 'fov'),
            formatter: value => value.toFixed(1) + '°'
          }
        ],

      sceneObject.type == 'character' && (
        ModelLoader.isCustomModel(sceneObject.model)
          ? [
            ['div', { style: { flex: 1, paddingBottom: 6 } }, [
              [NumberSlider, {
                label: 'scale',
                min: 0.3,
                max: 3.05,
                step: 0.0254,
                value: sceneObject.height,
                onSetValue: createOnSetValue(sceneObject.id, 'height'),
              }]]
            ]
          ]
          : [
            ['div', { style: { flex: 1, paddingBottom: 6 } }, [
              [NumberSlider, {
                label: 'height',
                min: heightRange.min,
                max: heightRange.max,
                step: 0.0254,
                value: sceneObject.height,
                onSetValue: createOnSetValue(sceneObject.id, 'height'),
                formatter: value => feetAndInchesAsString(
                  ...metersAsFeetAndInches(
                    sceneObject.height
                  )
                )
              }],

              [
                NumberSlider,
                {
                  label: 'head',
                  min: 80,
                  max: 120,
                  step: 1,
                  value: sceneObject.headScale * 100,
                  onSetValue: createOnSetValue(sceneObject.id, 'headScale', value => value / 100),
                  formatter: value => Math.round(value).toString() + '%'
                }
              ],
              [
                ColorSelect,
                {
                  label: 'tint color',
                  value: sceneObject.tintColor,
                  onSetValue: createOnSetValue(sceneObject.id, 'tintColor')
                }
              ],
            ]],

          Object.values(initialState.models[sceneObject.model].validMorphTargets).length
            ? [
              'div',
              { style: { margin: '6px 0 3px 0', fontStyle: 'italic' } },
              'morphs'
            ]
            : [],

          Object.values(initialState.models[sceneObject.model].validMorphTargets).length
            ? [
              'div',
              { style: { flex: 1 } },
              Object.entries(sceneObject.morphTargets)
                .filter(m => initialState.models[sceneObject.model].validMorphTargets.includes(m[0])).map(([ key, value ]) =>
                  [
                    NumberSlider,
                    {
                      label: MORPH_TARGET_LABELS[key],
                      min: 0,
                      max: 100,
                      step: 1,
                      value: value * 100,
                      onSetValue: value => updateObject(
                        sceneObject.id,
                        { morphTargets: { [key]: value / 100 }}
                      ),
                      formatter: NumberSliderFormatter.percent
                    }
                  ])
            ]
            : [],
        ]
      ),

      (sceneObject.type == 'image' ) && [
        [
          NumberSlider, {
            label: 'opacity',
            value: sceneObject.opacity,
            min: 0.1,
            max: 1,
            onSetValue: value => updateObject(
              sceneObject.id,
              { opacity: value }
            )
          }
        ]
      ],

      (sceneObject.type == 'object' || sceneObject.type == 'character') && [
        ModelSelect, {
          id:sceneObject.id,
          model:sceneObject.model,

          rows: sceneObject.type == 'character' ? 2 : 3
        }
      ],

      sceneObject.type == 'character' && [
        PosePresetsEditor, {
          id: sceneObject.id,
        }
      ],
      sceneObject.type == 'character' && [
        HandPresetsEditor, {
          id: sceneObject.id,
          handPosePresetId: sceneObject.handPosePresetId,
          scene: scene
        }
      ],


      sceneObject.type == 'character' && [
        AttachableEditor, {
          id: sceneObject.id,
          SceneContext
        }
      ],
      sceneObject.type == 'character' && [
        AttachableInfo, {
          id: sceneObject.id,
          sceneObject,
          updateObject,
          scene: scene,
          NumberSlider,
        }
      ],
      sceneObject.type == 'character' &&
        selectedBone && [BoneEditor, { sceneObject, bone: selectedBone, updateCharacterSkeleton }],

      sceneObject.type == 'image' && [
        [
          'div', { style: { marginBottom: 12 }},
          [
            ['div.column',
              ['div.number-slider', [

                [
                  'div.number-slider__label',
                  [
                    'div',
                    'Image File',

                  ]
                ],

                // number-slider__control
                [
                  'div',
                  {
                    style: {
                      display: 'flex',
                      borderRadius: 4,
                      width: 181,
                      height: 27,
                      alignItems: 'center',
                      alignContent: 'flex-end',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)'
                    }
                  },
                  ['div', { style: { flex: 1, margin: '-3px 0 0 9px' } },
                    [
                      'a[href=#]',
                      {
                        onClick: preventDefault(event => {
                          let filepaths = dialog.showOpenDialog(null, {})
                          if (filepaths) {
                            let projectDir = path.dirname(storyboarderFilePath)
                            let assetsDir = path.join(projectDir, 'models', 'images')
                            fs.ensureDirSync(assetsDir)

                            let dsts = []
                            for (let src of filepaths) {
                              let dst = path.join(assetsDir, path.basename(src))
                              console.log('copying from', src, 'to', dst)
                              try {
                                fs.copySync(src, dst)
                                dsts.push(dst)
                              } catch (err) {
                                console.error('could not copy', src)
                                alert('could not copy ' + src)
                              }
                            }

                            let ids = dsts.map(filepath => path.relative(projectDir, filepath))
                            console.log('setting attachment ids', ids)

                            updateObject(sceneObject.id, { imageAttachmentIds: ids })
                          }

                          // automatically blur to return keyboard control
                          document.activeElement.blur()
                          transition('TYPING_EXIT')
                        }),

                        style: {
                          fontStyle: 'italic',
                          textDecoration: 'none',
                          borderBottomWidth: '1px',
                          borderBottomStyle: 'dashed',
                          fontSize: 13,
                          lineHeight: 1,
                          color: '#aaa',
                          textTransform: 'none'
                        }
                      },

                      sceneObject.imageAttachmentIds[0] !== 'placeholder'
                        ? sceneObject.imageAttachmentIds[0].split(/[\\\/]/).pop()
                        : '(none)'
                    ],
                  ]
                ]
              ]]
            ]
          ]
        ],
        [
          'div.row',
          { style: { alignItems: 'center', margin: '-6px 0 3px 0' } }, [

            ['div', { style: { width: 130 } }, 'visible to camera'],

            ['input', {
              type: 'checkbox',
              checked: sceneObject.visibleToCam,
              readOnly: true,
              style: {

              }
            }],

            ['label', {
              onClick: preventDefault(event => {
                updateObject(sceneObject.id, { visibleToCam: !sceneObject.visibleToCam })
              }),
            }, [
              'span'
            ]]
          ]
        ],
      ]

    ]
  )
}

const BoneEditor = ({ sceneObject, bone, updateCharacterSkeleton }) => {
  const [render, setRender] = useState(false)
  // has the user modified the skeleton?
  let rotation = sceneObject.skeleton[bone.name]
    // use the modified skeleton data
    ? sceneObject.skeleton[bone.name].rotation
    // otherwise, use the initial rotation of the bone
    : { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z }

  const createOnSetValue = (key, transform) => value => {
    updateCharacterSkeleton({
      id: sceneObject.id,
      name: bone.name,
      rotation: {
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        [key]: transform(value)
      }
    })
  }

  // the posePresetId and skeleton will change synchronously
  // but the three scene will not have updated bones until SceneManager renders
  // so for now, just wait until that has probably happened :/
  useEffect(() => {
    setRender(false)

    setTimeout(() => {
      setRender(true)
    }, 1)
  }, [sceneObject.posePresetId])

  return h(
    ['div.column', [

      ['div.column', { style: { marginBottom: 3 } }, [
        ['div', { style: { flex: 1, margin: '6px 0 3px 0' } }, 'Bone'],
        ['small', { style: { display: 'flex', flex: 1, marginLeft: 1, fontStyle: 'italic', opacity: 0.8 } }, bone.name]
      ]],

      ['div.column', [
        [NumberSlider,
          {
            label: 'x',
            min: -180,
            max: 180,
            step: 1,
            value: THREE.Math.radToDeg(rotation.x),
            onSetValue: createOnSetValue('x', THREE.Math.degToRad),
            transform: NumberSliderTransform.degrees,
            formatter: NumberSliderFormatter.degrees
          }
        ],
        [NumberSlider,
          {
            label: 'y',
            min: -180,
            max: 180,
            step: 1,
            value: THREE.Math.radToDeg(rotation.y),
            onSetValue: createOnSetValue('y', THREE.Math.degToRad),
            transform: NumberSliderTransform.degrees,
            formatter: NumberSliderFormatter.degrees
          }
        ],
        [NumberSlider,
          {
            label: 'z',
            min: -180,
            max: 180,
            step: 1,
            value: THREE.Math.radToDeg(rotation.z),
            onSetValue: createOnSetValue('z', THREE.Math.degToRad),
            transform: NumberSliderTransform.degrees,
            formatter: NumberSliderFormatter.degrees
          }
        ]
      ]]
    ]]
  )
}

const PhoneCursor = connect(
  state => ({
    selections: getSelections(state),
    sceneObjects: getSceneObjects(state),
  }),
  {
    selectObject,
    selectBone,
    updateObject
  })(
    ({ remoteInput, camera, largeCanvasRef, selectObject, selectBone, sceneObjects, selections, selectedBone, updateObject }) => {
      let startingDeviceRotation = useRef(null)
      let startingObjectRotation = useRef(null)
      let startingCameraPosition = useRef(null)
      let startingCameraOffset = useRef(null)
      let startingDirection = useRef(null)
      let tester = useRef(null)
      let isRotating = useRef(false)
      let isDragging = useRef(false)
      let intersectionPlane = useRef(null)
      let mousePosition = useRef(null)
      let virtualMouse = useRef(null)
      let xy = useRef({x:0, y:0})
      let startPosition = useRef(null)
      let viewportwidth = largeCanvasRef.current.clientWidth,
          viewportheight = largeCanvasRef.current.clientHeight
      const rect = largeCanvasRef.current.getBoundingClientRect();

      const { scene } = useContext(SceneContext)

      const setPlanePosition = (obj) => {
        let direction = new THREE.Vector3()
        camera.getWorldDirection( direction )
        let newPos = new THREE.Vector3()
        let dist = 5
        newPos.addVectors ( camera.position, direction.multiplyScalar( dist ) )
        obj.position.set(newPos.x, newPos.y, newPos.z)
        obj.lookAt(camera.position)
      }

      const setCylinderOrientation = (obj) => {
        let direction = new THREE.Vector3()
        camera.getWorldDirection( direction )
        obj.position.set(camera.x, camera.y, camera.z)
        //obj.quaternion.copy(camera.quaternion)
      }

      const findIntersection = ( origin, ph_direction, obj ) =>
      {
        var raycaster = new THREE.Raycaster(origin, ph_direction)
        var intersection = raycaster.intersectObject(obj, true)
        return intersection
      }

      const toScreenXY = ( position, camera ) => {

        var pos = position.clone()
        projScreenMat = new THREE.Matrix4()
        projScreenMat.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse )
        pos = pos.applyMatrix4( projScreenMat )
        return { x: ( pos.x  ),
             y: ( - pos.y )}
      }

      useEffect(() => {
        // move mouse here

        if (remoteInput.orbitMode) return
        else {
          if (isDragging.current) {
            isDragging.current = false
          }
        }
        if (camera !== undefined && camera !== null && remoteInput.mouseMode)
        {
          if (camera.parent) scene.current = camera.parent
          if (intersectionPlane.current)
          {
            // intersection plane exists
          } else {
            intersectionPlane.current = new THREE.Mesh(
              //new THREE.CylinderGeometry(1, 1, 40, 16, 2),
              new THREE.PlaneGeometry(100, 100, 2),
              new THREE.MeshBasicMaterial( {color: 0xffff00, side: THREE.DoubleSide} ))
            setPlanePosition(intersectionPlane.current)
            //setCylinderOrientation(intersectionPlane.current)
            //scene.current.add(intersectionPlane.current)  //
            intersectionPlane.current.updateMatrix()  // required for correct first pass
          }

          if (tester.current) {
            //console.log('tester exists')
          }
          else {
            tester.current = new THREE.Object3D()
            let m = new THREE.Mesh(
              new THREE.BoxGeometry(0.01, 0.01, 0.1),
              new THREE.MeshBasicMaterial({color: '#123123' })
            )
            m.position.z = -0.005
            tester.current.position.set(camera.position.x, camera.position.y, camera.position.z)
            tester.current.position.y += 0.05;
            tester.current.quaternion.copy(camera.quaternion)
            tester.current.add(new THREE.AxesHelper(1))
            tester.current.add(m)
            //scene.current.add(tester.current)
          }
        }

        // handling phone rotation to screen position here
        if (remoteInput.mouseMode)
        {
          if (remoteInput.down)
          {
            let [ alpha, beta, gamma ] = remoteInput.mag.map(THREE.Math.degToRad)
            if (!isRotating.current) {
              //starting rotation
              let target = tester.current
              startingObjectRotation.current ={
                x: target.rotation.x,
                y: target.rotation.y,
                z: target.rotation.z
              }
              startingDeviceRotation.current = {
                alpha: alpha,
                beta: beta,
                gamma: gamma
              }
              mousePosition.current = {x: 0, y: 0} //robot.getMousePos()
              virtualMouse.current = {
                x: mousePosition.x,
                y: mousePosition.y
              }
              //
            }
            let w = 0,
              x = 0,
              y = 0,
              z = 1
            let startingDeviceQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(startingDeviceRotation.current.beta, startingDeviceRotation.current.alpha, -startingDeviceRotation.current.gamma, 'YXZ')).multiply(new THREE.Quaternion(w, x, y, z))
            let deviceQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(beta, alpha, -gamma, 'YXZ')).multiply(new THREE.Quaternion(w, x, y, z))
            //startingDeviceQuaternion.multiply(camera.quaternion)
            //deviceQuaternion.multiply(camera.quaternion)
            let deviceDifference = startingDeviceQuaternion.clone().inverse().multiply(deviceQuaternion)
            let startingObjectQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(startingObjectRotation.current.x,startingObjectRotation.current.y,startingObjectRotation.current.z))
            startingObjectQuaternion.multiply(deviceDifference)
            tester.current.quaternion.copy(startingObjectQuaternion)
            let dir = new THREE.Vector3()
            tester.current.updateMatrixWorld()
            tester.current.children[0].getWorldDirection(dir).negate()
            let intersect = findIntersection(camera.position, dir, intersectionPlane.current)
            if (intersect.length>0)
            {
              // let point = new THREE.Mesh(
              //   new THREE.SphereGeometry(0.05),
              //   new THREE.MeshBasicMaterial({color: "#ff0000"})
              // )
              // point.position.copy(intersect[0].point)
              // scene.add(point)

              let xy_coords = toScreenXY( intersect[0].point, camera )
              if (!isRotating.current)
              {
                isRotating.current = true
                firstRun = false
                startPosition.current = {
                  x: xy_coords.x * 300, // * viewportwidth/4,
                  y: xy_coords.y * 300 //* viewportheight/4
                }
              }
              //virtualMouse.current.x = mousePosition.current.x - ((startPosition.current.x - xy_coords.x * viewportwidth/4)/2)
              //virtualMouse.current.y = mousePosition.current.y - ((startPosition.current.y - xy_coords.y * viewportheight/4)/2)
              virtualMouse.current.x = mousePosition.current.x - ((startPosition.current.x - xy_coords.x * 300)/2)
              virtualMouse.current.y = mousePosition.current.y - ((startPosition.current.y - xy_coords.y * 300)/2)
              //robot.moveMouse(virtualMouse.current.x, virtualMouse.current.y)
            }
          } else {
            if (scene.current && tester.current!=null)
            {
              if (isRotating.current)
              {
                isRotating.current = false
                //robot.mouseClick()
              }

              scene.current.remove(tester.current)
              scene.current.remove(intersectionPlane.current)
              tester.current = null
              intersectionPlane.current = null
            }
          }
        } else {
          // not in mouse mode
          if (scene.current && tester.current!=null)
          {
            if (isRotating.current)
            {
              isRotating.current = false
              //robot.mouseClick()
            }

            scene.current.remove(tester.current)
            scene.current.remove(intersectionPlane.current)
            tester.current = null
            intersectionPlane.current = null
          }
        }

      }, [remoteInput, selections])


      useEffect(() => {
        // handling phone rotation to camera orbit
        if (!remoteInput.orbitMode)
        {
          if (isDragging.current) {
            //robot.mouseToggle("up", "left")
            isDragging.current = false
            isRotating.current = false
          }
          return
        }
        if ( camera !== undefined && camera !== null )
        {
          if (camera.parent) scene.current = camera.parent
        }

        if (remoteInput.orbitMode)
        {
          let firstRun = false
          let [ alpha, beta, gamma ] = remoteInput.mag.map(THREE.Math.degToRad)
          if (!isDragging.current) {
            //starting rotation
            firstRun = true
            isDragging.current = true
            startingCameraPosition.current = camera.position.clone()
            startingDirection.current = new THREE.Vector3()
            camera.getWorldDirection(startingDirection.current)
            startingDeviceRotation.current = {
              alpha: alpha,
              beta: beta,
              gamma: gamma
            }
            mousePosition.current = {x: 0, y: 0} //robot.getMousePos()
            virtualMouse.current = {
              x: mousePosition.x,
              y: mousePosition.y
            }

          }
          let w = 0,
            x = 0,
            y = 0,
            z = 1
          let startingDeviceQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(startingDeviceRotation.current.beta, startingDeviceRotation.current.alpha, -startingDeviceRotation.current.gamma, 'YXZ')).multiply(new THREE.Quaternion(w, x, y, z))
          let deviceQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(beta, alpha, -gamma, 'YXZ')).multiply(new THREE.Quaternion(w, x, y, z))

          let deviceDifference = startingDeviceQuaternion.clone().inverse().multiply(deviceQuaternion)

          let rot = new THREE.Euler().setFromQuaternion(deviceDifference)

          let direction = new THREE.Vector3()
          camera.getWorldDirection( direction )

          let objInScene = scene.children.find(o => o.userData.id === selections[0])

          let newPos = new THREE.Vector3()
          let getDistanceToPosition = new THREE.Vector3()
          if (sceneObjects[selections[0]] && (sceneObjects[selections[0]].type === 'object' || sceneObjects[selections[0]].type === 'character'))
          {
            getDistanceToPosition = objInScene.position.clone()
            if (selectedBone)
            {
              let skel = objInScene.userData.skeleton// (objInScene.children[0] instanceof THREE.Mesh) ? object.current.children[0] : object.current.children[1]
              let realBone = skel.bones.find(bone => bone.uuid == selectedBone)
              let bonePosition = new THREE.Vector3()
              realBone.getWorldPosition( bonePosition )
              getDistanceToPosition = bonePosition.clone()
            }
          }
          let dist = (sceneObjects[selections[0]] && (sceneObjects[selections[0]].type === 'object' || sceneObjects[selections[0]].type === 'character')) ? startingCameraPosition.current.distanceTo(getDistanceToPosition) : 3
          newPos.addVectors ( startingCameraPosition.current, direction.multiplyScalar( dist ) )
          if (firstRun)
          {
            firtRun = false
            startingCameraOffset.current = newPos
          }

          let radPerPixel = (Math.PI / 30),
            center = startingCameraOffset.current
            deltaPhi = radPerPixel * rot.y,
            deltaTheta = -radPerPixel * rot.x,
            campos = new THREE.Vector3(startingCameraPosition.current.x, startingCameraPosition.current.y, startingCameraPosition.current.z),
            pos = camera.position.clone().sub(center),
            radius = dist,
            theta = Math.acos(pos.y / radius),
            phi = Math.atan2(pos.z, pos.x)

          theta = Math.min(Math.max(theta - deltaTheta, 0), Math.PI)
          phi -= deltaPhi
          pos.x = radius * Math.sin(theta) * Math.cos(phi);
          pos.z = radius * Math.sin(theta) * Math.sin(phi);
          pos.y = radius * Math.cos(theta)

          //TODO limit y position to 0 (ground level)
          pos.add(center)

          let cam = {
            x: pos.x,
            y: pos.y,
            z: pos.z,
          }
          let testCam = new THREE.PerspectiveCamera()
          testCam.position.copy(cam)
          testCam.lookAt(startingCameraOffset.current)

          let cameraId = camera.userData.id
          let euler = new THREE.Euler()
          euler.setFromQuaternion( testCam.quaternion.clone().normalize(), "YXZ" )

          if (cam.y < 0) cam.y = 0
          cam.y = cam.y > startingCameraOffset.current.y + radius - radius/20 ? startingCameraOffset.current.y + radius - radius/20 : cam.y

          updateObject(cameraId, {
            x: cam.x,
            y: cam.z,
            z: cam.y,
            rotation: euler.y,
            tilt: euler.x,
            // roll: camera.rotation.z
          })

        } else {
          // not in orbit mouse mode
          if (scene.current && tester.current!=null)
          {
            if (isDragging.current)
            {
              isDragging.current = false
            }
            scene.current.remove(tester.current)
            scene.current.remove(intersectionPlane.current)
            tester.current = null
            intersectionPlane.current = null
          }
        }
      }, [remoteInput])

      return h(
        ['div#phoneCursor', { key: 'cursor' } ,
          [
          ]
        ]
      )
    })

const getClosestCharacterInView = (objects, camera) => {
  let obj = null
  let dist = 1000000
  let allDistances = []

  for (var char of objects) {
    let d = camera.position.distanceTo(
      new THREE.Vector3(char.position.x, camera.position.y, char.position.z))

    allDistances.push({
      object: char,
      distance: d
    })
  }

  let compare = (a, b) => {
    if (a.distance < b.distance)
      return -1;
    if (a.distance > b.distance)
      return 1;
    return 0;
  }

  allDistances.sort(compare)

  for (var i = 0; i< allDistances.length; i++) {
    if (checkIfCharacterInCameraView(allDistances[i].object, camera))
      return allDistances[i]
  }

  return {
    object: obj,
    distance: dist !== 1000000 ? dist : 0
  }
}

const checkIfCharacterInCameraView = (character, camera) => {
  camera.updateMatrix()
  camera.updateMatrixWorld()
  var frustum = new THREE.Frustum()
  frustum.setFromMatrix(
    new THREE.Matrix4()
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))

  for (var hitter of character.bonesHelper.hit_meshes) {
    if (frustum.intersectsBox(new THREE.Box3().setFromObject( hitter ))) {
      return true
    }
  }
  return false
}

const ClosestObjectInspector = ({ camera, sceneObjects, characters }) => {
  const [result, setResult] = useState('')

  useEffect(() => {
    // HACK
    // we're delaying 1 frame until scene is guaranteed to be updated
    // wrap in a try/catch because the scene might not have the same characters
    // by the time we actually render
    // if we get an error in hit testing against empty objects, just ignore it
    requestAnimationFrame(() => {
      try {
        let closest = getClosestCharacterInView(characters, camera)

        let meters = parseFloat(Math.round(closest.distance * 100) / 100).toFixed(2)

        let sceneObject = closest.object ? sceneObjects[closest.object.userData.id] : undefined

        setResult(sceneObject
          ? `Distance to ${sceneObject.name || sceneObject.displayName}: ${meters}m`
          : '')

      } catch (err) {
        setResult('')
      }
    })
  }, [camera, sceneObjects, characters])

  return h(['div.camera-inspector__nearest-character', result])
}

const CameraInspector = connect(
  state => ({
    sceneObjects: getSceneObjects(state),
    activeCamera: getActiveCamera(state)
  })
)(
  React.memo(({ camera, sceneObjects, activeCamera }) => {
    const { scene } = useContext(SceneContext)

    if (!camera) return h(['div.camera-inspector'])

    let cameraState = sceneObjects[activeCamera]

    let tiltInDegrees = Math.round(cameraState.tilt * THREE.Math.RAD2DEG)

    let meters = parseFloat(Math.round(cameraState.z * 100) / 100).toFixed(2)

    let cameraNumber = Object.values(sceneObjects)
                        .filter(o => o.type === 'camera')
                        .indexOf(cameraState) + 1

    let cameraName = cameraState.name || `Camera ${cameraNumber}`

    let fakeCamera = camera.clone() // TODO reuse a single object
    fakeCamera.fov = cameraState.fov
    let focalLength = fakeCamera.getFocalLength()
    fakeCamera = null

    return h(
      ['div.camera-inspector',

        ['div.row',
          { style: { justifyContent: 'space-between' } },
          [
            'div',
            `${cameraName}, ${Math.round(focalLength)}mm, f/1.4`,
            ['br'],
            `Height: ${meters}m Tilt: ${tiltInDegrees}°`,
            ['br'],
            [ClosestObjectInspector, {
              camera,
              sceneObjects,
              characters: scene.children.filter(o => o.userData.type === 'character')
            }]
          ]
        ]
        // [RemoteInputView, { remoteInput }]
      ]
    )
  }
))

// const { durationOfWords } = require('../utils')
const BoardInspector = connect(
  state => ({
    board: state.board
  })
)(
({ board }) => {
  const present = value => value && value.length > 1

  // let suggestedDuration = durationOfWords(dialogue, 300) + 300
  // let suggestedDurationInSeconds = suggestedDuration / 1000
  // let durationString = `// about ${suggestedDurationInSeconds} seconds`

  return h(
    ['div.column.board-inspector', [
      present(board.shot)
        ? ['div.board-inspector__shot', 'Shot ' + board.shot]
        : ['div.board-inspector__shot', 'Loading …'],

      present(board.dialogue) && ['p.board-inspector__dialogue', 'DIALOGUE: ' + board.dialogue],
      present(board.action) && ['p.board-inspector__action', 'ACTION: ' + board.action],
      present(board.notes) && ['p.board-inspector__notes', 'NOTES: ' + board.notes]
    ]]
  )
})

const CameraPanelInspector = connect(
    state => ({
      sceneObjects: getSceneObjects(state),
      activeCamera: getActiveCamera(state),
      selections: getSelections(state),
      cameraShots: state.cameraShots
    }),
    {
      updateObject,
      setCameraShot
    }
)(
  React.memo(({ camera, selections, sceneObjects, activeCamera, cameraShots, updateObject, setCameraShot }) => {
    if (!camera) return h(['div.camera-inspector'])
    const { scene } = useContext(SceneContext)
    
    const shotInfo = cameraShots[camera.userData.id] || {}
    const [currentShotSize, setCurrentShotSize] = useState(shotInfo.size)
    const [currentShotAngle, setCurrentShotAngle] = useState(shotInfo.angle)
  
    const selectionsRef = useRef(selections)
    const selectedCharacters = useRef([])
    
    useEffect(() => {
      selectionsRef.current = selections;
  
      selectedCharacters.current = selections.filter((id) => {
        return (sceneObjects[id] && sceneObjects[id].type === 'character')
      })
    }, [selections])
  
    useEffect(() => {
      setCurrentShotSize(shotInfo.size)
    }, [shotInfo.size, camera])
  
    useEffect(() => {
      setCurrentShotAngle(shotInfo.angle)
    }, [shotInfo.angle, camera])
    
    let cameraState = {...sceneObjects[activeCamera]}
    
    let fakeCamera = camera.clone() // TODO reuse a single object
    let focalLength = fakeCamera.getFocalLength()
    let cameraRoll = Math.round(THREE.Math.radToDeg(cameraState.roll))
    let cameraPan = Math.round(THREE.Math.radToDeg(cameraState.rotation))
    let cameraTilt = Math.round(THREE.Math.radToDeg(cameraState.tilt))
    
    const getValueShifter = (draft) => () => {
      for (let [k, v] of Object.entries(draft)) {
        cameraState[k] += v
      }
  
      updateObject(cameraState.id, cameraState)
    }
    
    const moveCamera = ([speedX, speedY]) => () => {
      cameraState = CameraControls.getMovedState(cameraState, {x: speedX, y: speedY})
      updateObject(cameraState.id, cameraState)
    }
  
    const getCameraPanEvents = useDrag(throttle(({ down, delta: [dx, dy] }) => {
      let rotation = THREE.Math.degToRad(cameraPan - dx)
      let tilt = THREE.Math.degToRad(cameraTilt - dy)
      
      updateObject(cameraState.id, {rotation, tilt})
    }, 100, {trailing:false}))
    
    const onSetShot = ({size, angle}) => {
      let selected = scene.children.find((obj) => selectedCharacters.current.indexOf(obj.userData.id) >= 0)
      let characters = scene.children.filter((obj) => obj.userData.type === 'character')
  
      if (characters.length) {
        setShot({
          camera,
          characters,
          selected,
          updateObject,
          shotSize: size,
          shotAngle: angle
        })
      }
      
      setCameraShot(camera.userData.id, {size, angle})
    }
  
    const shotSizes = [
      {value: ShotSizes.EXTREME_CLOSE_UP, label: 'Extreme Close Up'},
      {value: ShotSizes.VERY_CLOSE_UP, label: 'Very Close Up'},
      {value: ShotSizes.CLOSE_UP, label: 'Close Up'},
      {value: ShotSizes.MEDIUM_CLOSE_UP, label: 'Medium Close Up'},
      {value: ShotSizes.BUST, label: 'Bust'},
      {value: ShotSizes.MEDIUM, label: 'Medium Shot'},
      {value: ShotSizes.MEDIUM_LONG, label: 'Medium Long Shot'},
      {value: ShotSizes.LONG, label: 'Long Shot / Wide'},
      {value: ShotSizes.EXTREME_LONG, label: 'Extreme Long Shot'},
      {value: ShotSizes.ESTABLISHING, label: 'Establishing Shot'}
    ]
  
    const shotAngles = [
      {value: ShotAngles.BIRDS_EYE, label: 'Bird\'s Eye'},
      {value: ShotAngles.HIGH, label: 'High'},
      {value: ShotAngles.EYE, label: 'Eye'},
      {value: ShotAngles.LOW, label: 'Low'},
      {value: ShotAngles.WORMS_EYE, label: 'Worm\'s Eye'}
    ]
    
    return h(
        ['div.camera-inspector',
          
          [
            ['div.camera-item.roll',
              [
                ['div.camera-item-control', [
                    ['div.row', [
                      ['div.camera-item-button', {...useLongPress(getValueShifter({roll: -THREE.Math.DEG2RAD}))}, ['div.arrow.left']],
                      ['div.camera-item-button', {...useLongPress(getValueShifter({roll: THREE.Math.DEG2RAD}))}, ['div.arrow.right']]
                    ]]
                ]],
                ['div.camera-item-label', `Roll: ${cameraRoll}°`]
              ]
            ],
            ['div.camera-item.pan',
              [
                ['div.camera-item-control', [
                  ['div.row', [
                      ['div.pan-control', {...getCameraPanEvents()}, ['div.pan-control-target']]
                  ]]
                ]],
                ['div.camera-item-label', `Pan: ${cameraPan}° // Tilt: ${cameraTilt}°`]
              ]
            ],
            ['div.camera-item.move',
              [
                ['div.camera-item-control', [
                  ['div.row', {style: {justifyContent: 'center'}}, [
                    ['div.camera-item-button', {...useLongPress(moveCamera([0, -0.1]))}, ['div.arrow.up']]
                  ]],
                  ['div.row', [
                    ['div.camera-item-button', {...useLongPress(moveCamera([-0.1, 0]))}, ['div.arrow.left']],
                    ['div.camera-item-button', {...useLongPress(moveCamera([0, 0.1]))}, ['div.arrow.down']],
                    ['div.camera-item-button', {...useLongPress(moveCamera([0.1, 0]))}, ['div.arrow.right']]
                  ]]
                ]],
                ['div.camera-item-label', 'Move']
              ]
            ],
            ['div.camera-item.elevate',
              [
                ['div.camera-item-control', [
                  ['div.row', [
                    ['div.camera-item-button', {...useLongPress(getValueShifter({z: 0.1}))}, ['div.arrow.up']]
                  ]],
                  ['div.row', [
                    ['div.camera-item-button', {...useLongPress(getValueShifter({z: -0.1}))}, ['div.arrow.down']]
                  ]]
                ]],
                ['div.camera-item-label', `Elevate: ${cameraState.z.toFixed(2)}m`]
              ]
            ],
            ['div.camera-item.lens',
              [
                ['div.camera-item-control', [
                  ['div.row', [
                    ['div.camera-item-button', {...useLongPress(getValueShifter({fov: 0.2}))}, ['div.arrow.left']],
                    ['div.camera-item-button', {...useLongPress(getValueShifter({fov: -0.2}))}, ['div.arrow.right']]
                  ]]
                ]],
                ['div.camera-item-label', `Lens: ${focalLength.toFixed(2)}mm`]
              ]
            ],
            ['div.camera-item.shots',
              [
                ['div.select',
                  [Select, {
                    label: 'Shot Size',
                    value: shotSizes.find(option => option.value === currentShotSize),
                    options: shotSizes,
                    onSetValue: (item) => onSetShot({size: item.value, angle: shotInfo.angle})
                }]],
                ['div.select',
                  [Select, {
                    label: 'Camera Angle',
                    value: shotAngles.find(option => option.value === currentShotAngle),
                    options: shotAngles,
                    onSetValue: (item) => onSetShot({size: shotInfo.size, angle: item.value})
                }]]
              ]
            ]
          ]
        ]
    )
  }
))

const GuidesInspector = connect(
  state => ({
    center: state.workspace.guides.center,
    thirds: state.workspace.guides.thirds,
    eyeline: state.workspace.guides.eyeline
  }),
  {
    toggleWorkspaceGuide
  }
)(
(({
  center, thirds, eyeline,
  toggleWorkspaceGuide
}) =>
  h(['div.guides-inspector', [
    'div.row',
      ['div.guides-inspector__label', 'Guides'],
        ['div.round-buttons-panel', [
          [
            'a[href=#]',
            {
              className: classNames({ active: center }),
              onClick: preventDefault(() => toggleWorkspaceGuide('center'))
            },
            [[Icon, { src: 'icon-guides-center' }]]
          ],
          [
            'a[href=#]',
            {
              className: classNames({ active: thirds }),
              onClick: preventDefault(() => toggleWorkspaceGuide('thirds'))
            },
            [[Icon, { src: 'icon-guides-thirds' }]]
          ],
          [
            'a[href=#]',
            {
              className: classNames({ active: eyeline }),
              onClick: preventDefault(() => toggleWorkspaceGuide('eyeline'))
            },
            [[Icon, { src: 'icon-guides-eyeline' }]]
          ]
        ]]
      ]]
)))

const CamerasInspector = connect(
  state => ({
    activeCamera: getActiveCamera(state),
    _cameras: getCameraSceneObjects(state)
  }),
  {
    setActiveCamera,
    selectObject
  }
)(
({
  // props
  activeCamera,

  // via selectors
  _cameras,

  // action creators
  setActiveCamera,
  selectObject
}) => {

  const onClick = (camera, event) => {
    event.preventDefault()

    undoGroupStart()
    selectObject(camera.id)
    setActiveCamera(camera.id)
    undoGroupEnd()
  }

  return h(['div.cameras-inspector', [
    'div.row',
      ['div.cameras-inspector__label', 'Camera'],
      ['div.round-buttons-panel',
        _cameras.map(
          (camera, n) =>
            [
              'a[href=#]',
              {
                className: classNames({ active: activeCamera === camera.id }),
                onClick: onClick.bind(this, camera)
              },
              n + 1
            ]
        )
      ]
  ]])
})

// TODO move selector logic into reducers/shot-generator?
// memoized selectors
const getCameraSceneObjects = createSelector(
  [getSceneObjects],
  (sceneObjects) => Object.values(sceneObjects).filter(o => o.type === 'camera')
)
const getSelectedSceneObject = createSelector(
  [getSceneObjects, getSelections],
  (sceneObjects, selections) => Object.values(sceneObjects).find(o => o.id === selections[0])
)
const canDelete = (sceneObject, activeCamera) =>
  // allow objects
  sceneObject.type === 'object' ||
  // allow characters
  sceneObject.type === 'character' ||
  // allow volumes
  sceneObject.type === 'volume' ||
  // allow lights
  sceneObject.type === 'light' ||
  // allow images
  sceneObject.type === 'image' ||
  // allow cameras which are not the active camera
  (sceneObject.type === 'camera' && sceneObject.id !== activeCamera)

const menu = require('../menu')
const onMenuFocus = () => {
  menu.setShotGeneratorMenu()
}
const MenuManager = ({ }) => {
  useEffect(() => {
    let win = remote.getCurrentWindow()
    win.on('focus', onMenuFocus)
    onMenuFocus()

    return function cleanup () {
      win.off('focus', onMenuFocus)
    }
  }, [])
  return null
}

const { dropObject, dropCharacter } = require("../utils/dropToObjects")
const getGroupAction = require("../utils/getGroupAction")

const KeyHandler = connect(
  state => ({
    mainViewCamera: state.mainViewCamera,
    activeCamera: getActiveCamera(state),
    selections: getSelections(state),
    sceneObjects: getSceneObjects(state),

    _selectedSceneObject: getSelectedSceneObject(state),

    _cameras: getCameraSceneObjects(state)
  }),
  {
    setMainViewCamera,
    selectObject,
    setActiveCamera,
    duplicateObjects,
    deleteObjects,
    groupObjects,
    ungroupObjects,
    mergeGroups,
    updateObject,
    undoGroupStart,
    undoGroupEnd,
    updateObjects
  }
)(
  ({
    mainViewCamera,
    activeCamera,
    selections,
    sceneObjects,
    _selectedSceneObject,
    _cameras,
    setMainViewCamera,
    selectObject,
    setActiveCamera,
    duplicateObjects,
    deleteObjects,
    groupObjects,
    ungroupObjects,
    mergeGroups,
    updateObject,
    undoGroupStart,
    undoGroupEnd,
    updateObjects
  }) => {
    const { scene } = useContext(SceneContext)
    let sceneChildren = scene ? scene.children.length : 0
    const dropingPlaces = useMemo(() => {
      if(!scene) return
      return scene.children.filter(o =>
        o.userData.type === 'object' ||
        o.userData.type === 'character' ||
        o.userData.type === 'ground')
    }, [sceneChildren])
    const onCommandDuplicate = () => {
      if (selections) {
        let selected = (_selectedSceneObject.type === 'group') ? [_selectedSceneObject.id] : selections
        // NOTE: this will also select the new duplicates, replacing selection
        duplicateObjects(
          // ids to duplicate
            selected,
          // new ids
            selected.map(THREE.Math.generateUUID)
        )
      }
    }
    
    const onCommandGroup = () => {
      if (selections) {
        const groupAction = getGroupAction(sceneObjects, selections)
        if (groupAction.shouldGroup) {
          groupObjects(groupAction.objectsIds)
        } else if (groupAction.shouldUngroup) {
          ungroupObjects(groupAction.groupsIds[0], groupAction.objectsIds)
        } else {
          mergeGroups(groupAction.groupsIds, groupAction.objectsIds)
        }
      }
    }

    const onCommandDrop = () => {
      let changes = {}
      for( let i = 0; i < selections.length; i++ ) {
        let selection = scene.children.find( child => child.userData.id === selections[i] )
        if( selection.userData.type === "object" ) {
          dropObject( selection, dropingPlaces )
          let pos = selection.position
          changes[ selections[i] ] = { x: pos.x, y: pos.z, z: pos.y }
        } else if ( selection.userData.type === "character" ) {
          dropCharacter( selection, dropingPlaces )
          let pos = selection.position
          changes[ selections[i] ] = { x: pos.x, y: pos.z, z: pos.y }
        }
      }
      updateObjects(changes)
    }

    useEffect(() => {
      const onCameraSelectByIndex = index => {
        if (_cameras[index]) {
          let id = _cameras[index].id
          undoGroupStart()
          selectObject(id)
          setActiveCamera(id)
          undoGroupEnd()
        }
      }

      const onKeyDown = event => {
        if (event.key === 'Backspace' || event.key === 'Delete') {
          if (selections.length && canDelete(_selectedSceneObject, activeCamera)) {
            let choice = dialog.showMessageBox(null, {
              type: 'question',
              buttons: ['Yes', 'No'],
              message: `Deleting ${selections.length} item${selections.length > 1 ? 's' : ''}. Are you sure?`
            })
            if (choice === 0) {
              deleteObjects(selections)
            }
          }
        }
        if (event.key === 't') {
          setMainViewCamera(mainViewCamera === 'ortho' ? 'live' : 'ortho')
        }
        if (event.key === 'Escape') {
          selectObject(activeCamera)
        }
        if (
          event.key === '1' ||
          event.key === '2' ||
          event.key === '3' ||
          event.key === '4' ||
          event.key === '5' ||
          event.key === '6' ||
          event.key === '7' ||
          event.key === '8' ||
          event.key === '9'
          ) {
            onCameraSelectByIndex(parseInt(event.key, 10) - 1)
          }

        if (
          (event.key === 'z' || event.key === 'x') &&
          !event.shiftKey &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey
        ) {
          let cameraState = _cameras.find(camera => camera.id === activeCamera)
          let roll = {
            'z': Math.max(cameraState.roll - THREE.Math.DEG2RAD, -45 * THREE.Math.DEG2RAD),
            'x': Math.min(cameraState.roll + THREE.Math.DEG2RAD, 45 * THREE.Math.DEG2RAD)
          }[event.key]

          updateObject(activeCamera, { roll })
        }

        if (event.key === '[' || event.key === ']') {
          let cameraState = _cameras.find(camera => camera.id === activeCamera)

          let mms = [12, 16, 18, 22, 24, 35, 50, 85, 100, 120, 200, 300, 500]

          let camera = scene.children.find(child => child.userData.id === activeCamera)
          let fakeCamera = camera.clone() // TODO reuse a single object
          let fovs = mms.map(mm => {
            fakeCamera.setFocalLength(mm)
            return fakeCamera.fov
          }).sort((a, b) => a - b)
          fakeCamera = null

          let index = indexIn(fovs, cameraState.fov)

          let fov = {
            '[': fovs[Math.min(index + 1, fovs.length)],
            ']': fovs[Math.max(index - 1, 0)]
          }[event.key]

          updateObject(activeCamera, { fov })
        }
      }

      window.addEventListener('keydown', onKeyDown)
      ipcRenderer.on('shot-generator:object:duplicate', onCommandDuplicate)
      ipcRenderer.on('shot-generator:object:group', onCommandGroup)
      ipcRenderer.on('shot-generator:object:drop', onCommandDrop)
      
      return function cleanup () {
        window.removeEventListener('keydown', onKeyDown)
        ipcRenderer.off('shot-generator:object:drop', onCommandDrop)
        ipcRenderer.off('shot-generator:object:duplicate', onCommandDuplicate)
        ipcRenderer.off('shot-generator:object:group', onCommandGroup)
      }
    }, [mainViewCamera, _cameras, selections, _selectedSceneObject, activeCamera])

    return null
  }
)

// TODO move to selectors file
const getLoadableSceneObjects = createSelector(
  [getSceneObjects],
  sceneObjects => Object.values(sceneObjects)
    .filter(sceneObject =>
      (sceneObject.type === 'character' || sceneObject.type === 'object') &&
      sceneObject.loaded != null
    )
)
const getLoadableSceneObjectsRemaining = createSelector(
  [getLoadableSceneObjects],
  loadableSceneObjects => loadableSceneObjects.filter(sceneObject => sceneObject.loaded === false)
)

const LoadingStatus = connect(
  state => ({
    storyboarderFilePath: state.meta.storyboarderFilePath,
    remaining: getLoadableSceneObjectsRemaining(state),
    attachments: state.attachments
  })
)(React.memo(({ ready, remaining, attachments, storyboarderFilePath }) => {
  let message

  let inprogress = remaining.filter(loadable => {
    let filepathForModel = ModelLoader.getFilepathForModel(loadable, { storyboarderFilePath })
    if (attachments[filepathForModel]) {
      // in cache but in progress
      return attachments[filepathForModel].status === 'NotAsked' || attachments[filepathForModel].status === 'Loading'
    } else {
      // not even in cache yet
      return true
    }
  })

  if (!ready) {
    message = 'Initializing Shot Generator …'
  } else if (inprogress.length) {
    message = 'Loading models …'
  }

  if (!message) return null

  return h(
    ['div.modal-overlay', [
      ['div.modal', [
        ['div.modal__content', [
          ['div.title', 'Loading'],
          ['div.message', message]
        ]]
      ]]
    ]]
  )

}))

// const saveScenePresets = state => presetsStorage.saveScenePresets({ scenes: state.presets.scenes })
// const PresetsEditor = connect(
//   state => ({
//     presets: state.presets
//   }),
//   {
//     loadScenePreset: id => (dispatch, getState) => {
//       let choice = dialog.showMessageBox(null, {
//         type: 'question',
//         buttons: ['Yes', 'No'],
//         message: 'Your existing scene will be cleared. Are you sure?',
//         defaultId: 1 // default to No
//       })
//       if (choice === 0) {
//         let state = getState()
//         let preset = state.presets.scenes[id]
//         dispatch(loadScene({
//           world: preset.state.world,
//           sceneObjects: preset.state.sceneObjects,
//           activeCamera: preset.state.activeCamera
//         }))
//       }
//     },
//
//     createScenePreset: () => (dispatch, getState) => {
//       // show a prompt to get the desired preset name
//       let id = THREE.Math.generateUUID()
//       prompt({
//         title: 'Preset Name',
//         label: 'Select a Preset Name',
//         value: `Scene ${shortId(id)}`
//       }, require('electron').remote.getCurrentWindow()).then(name => {
//         if (name != null && name != '' && name != ' ') {
//           let state = getState()
//           let preset = {
//             id,
//             name,
//             state: {
//               // TODO
//               world: state.world,
//               sceneObjects: getSceneObjects(state),
//               activeCamera: getActiveCamera(state)
//             }
//           }
//           dispatch(createScenePreset(preset))
//           saveScenePresets(getState())
//         }
//       }).catch(err => {
//         console.error(err)
//       })
//     },
//
//     updateScenePreset: (id, values) => (dispatch, getState) => {
//       dispatch(updateScenePreset(id, values))
//       saveScenePresets(getState())
//     },
//
//     deleteScenePreset: id => (dispatch, getState) => {
//       let choice = dialog.showMessageBox(null, {
//         type: 'question',
//         buttons: ['Yes', 'No'],
//         message: 'This scene preset will be deleted. Are you sure?',
//         defaultId: 1 // default to No
//       })
//       if (choice === 0) {
//         dispatch(deleteScenePreset(id))
//         saveScenePresets(getState())
//       }
//     }
//   }
// )(
// ({ presets, loadScenePreset, createScenePreset, updateScenePreset, deleteScenePreset, transition }) => {
//   const onLoadClick = (preset, event) => {
//     event.preventDefault()
//     loadScenePreset(preset.id)
//   }
//
//   const onSaveClick = event => {
//     event.preventDefault()
//     createScenePreset()
//   }
//
//   const onDeleteClick = id => {
//     event.preventDefault()
//     deleteScenePreset(id)
//   }
//
//   const onEditClick = (preset, event) => {
//     event.preventDefault()
//     updateScenePreset(preset.id, { name: 'ok'})
//   }
//
//   const onFocus = event => transition('TYPING_ENTER')
//   const onBlur = event => transition('TYPING_EXIT')
//
//   return h([
//     'div', { style: { padding: 6 } }, [
//       ['h3', { style: { margin: '24px 0 12px 0' } }, 'Preset Scenes'],
//
//       ['ul', Object.values(presets.scenes).map(preset =>
//         ['li.element', { style: { display: 'flex', justifyContent: 'space-between' } },
//
//           ['a.select[href=#]', { style: { color: 'white', textDecoration: 'none', display: 'flex', alignSelf: 'center', top: -3, position: 'relative', width: '1.5rem' }, onClick: onLoadClick.bind(this, preset) }, '⇧'],
//
//           [
//             'span',
//             { style: { flex: 1 } },
//             [
//               LabelInput,
//               {
//                 key: preset.id,
//                 label: preset.name != null
//                   ? preset.name
//                   : `Preset ${shortId(preset.id)}`,
//                 onFocus,
//                 onBlur,
//                 setLabel: name => {
//                   updateScenePreset(preset.id, { name })
//                 }
//               }
//             ]
//           ],
//
//
//           ['a.delete[href=#]', { onClick: onDeleteClick.bind(this, preset.id) }, 'X']
//         ] )
//       ],
//
//       ['button', { style: { marginTop: 20, padding: '9px 12px', fontSize: 16 }, onClick: onSaveClick }, '+ Preset'],
//     ]
//   ])
// })

let stats
ipcRenderer.on('shot-generator:menu:view:fps-meter', (event, value) => {
  console.log('shot-generator:menu:view:fps-meter', event, value)
  if (!stats) {
    stats = new Stats()
    stats.showPanel(0)
    document.body.appendChild( stats.dom )
    stats.dom.style.top = '7px'
    stats.dom.style.left = '460px'
  } else {
    document.body.removeChild( stats.dom )
    stats = undefined
  }
})

// setInterval(() => {
//   let count = Object.values(store.getState().sceneObjects).length
//
//   store.dispatch(createObject({
//
//     id: count,
//     type: 'character',
//     height: 1.6,
//     x: 1 + (Math.random() * 0.5),
//     y: 0,
//     z: 0,
//     rotation: -0.8
//
//     // type: 'box',
//     // width: 1,
//     // height: 0.5,
//     // depth: 1,
//     // x: 4,
//     // y: 0.5,
//     // z: 0,
//     // rotation: 0,
//   }))
// }, 1000)
//
// setInterval(() => {
//   // let count = Object.values(store.getState().sceneObjects).length
//   store.dispatch(deleteObject(5))
//   store.dispatch(deleteObject(6))
//   store.dispatch(deleteObject(7))
// }, 3000)

// setInterval(() => {
//   let r = store.getState().sceneObjects[4].rotation
//   store.dispatch(updateObject(4, { rotation: r + 0.1 }))
// }, 1000)

module.exports = {
  SceneContext,
  ElementsPanel,
  CameraInspector,
  CameraPanelInspector,
  BoardInspector,
  GuidesInspector,
  CamerasInspector,
  KeyHandler,
  MenuManager,
  PhoneCursor,

  preventDefault,
  animatedUpdate,
  gltfLoader,

  stats
}
