const { TransformControls } = require( "../utils/TransformControls");
class ObjectRotationControl
{
    constructor(scene, camera, domElement, characterId, axis = null)
    {
        this.control = axis ? new TransformControls(camera, domElement, axis) : new TransformControls(camera, domElement);
        this.control.rotationOnly = true;
        this.control.setSpace("local")
        this.control.setMode('rotate');
        this.control.size = 0.2;
        this.control.userData.type = "objectControl";
        this.control.traverse(child => {
            child.userData.type = "objectControl";
        });
        this.object = null;
        this.scene = scene;
        this.isEnabled = false;
        this.customOnMouseDownAction = null;
        this.customOnMouseUpAction = null;
    }

    set IsEnabled(value) 
    {
        this.control.enabled = value
    }
    //#region Events
    onMouseDown = event => {
        this.object.isRotated = true;
        this.customOnMouseDownAction && this.customOnMouseDownAction();
    };

    onMouseUp = event => {
        this.customOnMouseUpAction && this.customOnMouseUpAction();
        this.updateCharacter && this.updateCharacter(this.object.name, this.object.rotation);
        this.object.isRotated = false;
    };
    //#enderegion

    setCharacterId(characterId) {
        this.control.characterId = characterId;
    }

    selectObject(object, hitmeshid)
    {
        if(this.object !== null && !this.isSelected(object))
        {
            this.control.detach();
            this.deselectObject();
        }
        if (object)
        {
            this.scene.add(this.control);
            this.control.addToScene();
        }
        this.control.objectId = hitmeshid;
        this.control.attach(object);
        this.object = object;
        this.control.addEventListener("transformMouseDown", this.onMouseDown, false);
        this.control.addEventListener("transformMouseUp", this.onMouseUp, false);
    }

    setUpdateCharacter(updateCharacter)
    {
        this.updateCharacter = updateCharacter;
    }

    deselectObject()
    {
        this.control.detach();
        this.scene.remove(this.control);
        this.IsEnabled = true;
        this.control.dispose();
        this.object = null;
        this.control.removeEventListener("transformMouseDown", this.onMouseDown);
        this.control.removeEventListener("transformMouseUp", this.onMouseUp);
        this.customOnMouseDownAction = null;
        this.customOnMouseUpAction = null;
    }

    setCamera(camera)
    {
        this.control.changeCamera(camera);
        this.control.updateMatrixWorld();
    }

    isSelected(object) {
        return this.object === object
    }

    cleanUp()
    {
        this.deselectObject();
        this.control.cleanUp();
        this.control = null;
        this.scene = null;
    }
}
module.exports = ObjectRotationControl;