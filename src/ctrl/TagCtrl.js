
import {makeErrorObj} from "../utils_own";

import TagChecker from "./tagChecker";


import {tagCheckerTest} from "../tests/tagChecker_t";

/**
 * this class collects the errors for the tags of a building and builds the error format needed for the UI. it uses a TagCheckerObject for this, where the regex, existence and more checks are made.
 */
class TAGAnalyzer extends Object{
    constructor(correctSITTypeObjects, building){
        super();

        //these are the already SIT tested Objects from SITAnalyzer, these have to be checked for SIT Tag conformity and Accessibility tag conformity and existence
        this.correctSITTypeObjects = correctSITTypeObjects; 
        //the building anaylzed
        this.building = building;
        //the tag checker. It has the core check functions (regex/existence etc) for the tags.
        this.tagChecker = new TagChecker(this.building);

        //errors for Tags based on basic SIT conformity//
        //error for Building tag values. Check TagChecker for in detail description, what these errors are, and how they are detected
        this.tagValueErrorsBuilding = [];

        //errors for existence of building tags
        this.tagExistenceErrorsBuilding = [];

        //errors for door tags
        this.tagErrorsDoors =[];

        //errors for level tag values
        this.levelTagValueErrors = [];

        //errors for level and repeat on errors
        this.levelAndRepeatErrors=[];

        //errors for non existence level (feature is given a level tag with a value of a level, which does not exist)
        this.nonExistingLevelErrors=[];

        //errors for missing level tags
        this.tagExistenceErrorsLevel=[];
        
        //errors for Min level/max level tags
        this.tagErrorMinMax=[];

        
        //set of the not sit conform objects, to join later with SITAnalyzer
        this.nonConformObjects = new Set();

        //errors for accessibility tags //
        //Check TagChecker for in detail description, what these errors are, and how they are detected
        //errors for basic accessibility for doors
        this.accDoorErrorBasic=[];

        //errors for premium/advanced accessibility for doors
        this.accDoorErrorPremium=[];

        //errors for basic accessibility for ramps
        this.accRampErrorBasic=[];

        //errors for premium/advanced accessibility for ramps
        this.accRampErrorPremium=[];

        //errors for basic accessibility for elevators
        this.accElevErrorBasic=[];

        //errors for premium/advanced accessibility for elevators
        this.accElevErrorPremium=[];

        //errors for basic accessibility for stairs
        this.accStairsErrorBasic=[];

        //errors for premium/advanced accessibility for stairs
        this.accStairsErrorPremium=[];

        //errors for accessibility for toilets
        this.accWC=[];

        //errors for accessibility of surfaces with the option of tactility
        this.accTAC=[];


        //the percentage for the errors above build with same naming scheme
        this.accDoorBasicPercentage = 0;
        this.accDoorPremiumPercentage = 0;
        this.accElevBasicPercentage=0;
        this.accElevPremiumPercentage=0;
        this.accStairsBasicPercentage=0;
        this.accStairsPremiumPercentage=0;
        this.accWCPercentage=0;
        this.accTACPercentage=0;
    }

        //build testing enviroment for TagTesting
         //build testing enviroment for TagTesting
    checkTagTest(){
        tagCheckerTest(this.building,this.correctSITTypeObjects.doors, window.vectorDataManager.getAllFeaturesInBuilding(this.building).features,this);
    }

    /**
     * Starting point for the tag checking in regards to SIT.
     * starts all coroutines for the tag checking and builds the errorObjects for the AnalysisToVisObj.js
     */
    checkTagsForSIT(){
        var building = this.building;
        var features = window.vectorDataManager.getAllFeaturesInBuilding(building).features;
        var buildingErrors = this.tagChecker.checkBuilding();
        var nonExisting = this.tagChecker.checkNonExistingLevel();

        var doors = this.tagChecker.checkDoors(this.correctSITTypeObjects.doors);
        var minmax = this.tagChecker.checkMinMaxLevel();
        var levels = this.tagChecker.checkLevel(features);
       
        if (buildingErrors.building === false){
            //error: building misses building tag
            this.tagExistenceErrorsBuilding.push(makeErrorObj("BUILDINGTAGS-2",[building.id,"building"],[]));
            this.nonConformObjects.add(building.id);
        }
        if (buildingErrors.building === true && buildingErrors.tag){
            //error: false value for building tag. buildingErrors.tag is the false value
            this.tagValueErrorsBuilding.push(makeErrorObj("BUILDINGTAGS-1",[building.id,"building"],[]));
            this.nonConformObjects.add(building.id);
        }

        for(var door of doors){
            //Door with id door has illegitim tag value.
            this.tagErrorsDoors.push(makeErrorObj("DOORTAGS-1",[door],[]));
            this.nonConformObjects.add(door.id);
        }
        if(minmax.max===false){
            //building is missing max_level tag
            this.tagExistenceErrorsBuilding.push(makeErrorObj("BUILDINGTAGS-2",[building.id,"max_level"],[]));
            this.nonConformObjects.add(building.id);
        }
        if(minmax.min===false){
            //building is missing min tag
            this.tagExistenceErrorsBuilding.push(makeErrorObj("BUILDINGTAGS-2",[building.id,"min_level"],[]));
            this.nonConformObjects.add(building.id);
        }
        if(minmax.maxTag){
            //building has illegitim max_level value
            this.tagValueErrorsBuilding.push(makeErrorObj("BUILDINGTAGS-1",[building.id,"max_level"],[]));
            this.nonConformObjects.add(building.id);
        }
        if(minmax.minTag){
            //building has illegitim min_level value
            this.tagValueErrorsBuilding.push(makeErrorObj("BUILDINGTAGS-1",[building.id,"min_level"],[]));
            this.nonConformObjects.add(building.id);
        }
        if(minmax.minGreaterMax){
            //min is bigger than max
            this.tagErrorMinMax.push(makeErrorObj("BUILDINGTAGS-3",[building.id],[]));
            this.nonConformObjects.add(building.id);
        }
        if(nonExisting!==false&&nonExisting!==true){
            //building building has illegitim non_existing_levels value (saved in nonExisting as string)
        }
        
        for(var level of levels){
            switch (level.error){
                case "falseNumbers":
                    //level tag has illegitim value for item = level.id
                    this.levelTagValueErrors.push(makeErrorObj("LEVELTAGS-1",[level.id],[]));
                    this.nonConformObjects.add(level.id);
                    break;
                case "noTags":
                    //item level.id has neither level or repeat_on tag
                    this.tagExistenceErrorsLevel.push(makeErrorObj("LEVELTAGS-2",[level.id],[]));
                    this.nonConformObjects.add(level.id);
                    break;
                case "bothTags":
                    this.levelAndRepeatErrors.push(makeErrorObj("LEVELTAGS-3",[level.id],[]));
                    this.nonConformObjects.add(level.id);
                    //item level.id has both, level and repeat on tag
                    break;
                case "nonExistingLevel":
                    this.nonExistingLevelErrors.push(makeErrorObj("LEVELTAGS-4",[level.id],[]));
                    this.nonConformObjects.add(level.id);
                    //item level.id has a value for level or repeat on which is no level of the building
                    break;
                default:
                    break;

            }
        }
    }

        /**
         * Startingfunction for accessibility tag checking. Gets the errorobject from the tagchecker.
         */
        checkTagsForAccessibility(){
            //gets all features of a building
            var features = window.vectorDataManager.getAllFeaturesInBuilding(this.building).features;
            
            //gets the errorobject from the tagcheker, tagchecker gets the objects to analyze (doors, features etc.)
            var accErrorObj = this.tagChecker.checkAccessibility(this.correctSITTypeObjects.doors,features,this.correctSITTypeObjects.areas,this.correctSITTypeObjects.corridors)
            this.buildAccessibilityErrors(accErrorObj);
            this.buildAccPercentages(accErrorObj);
    
        }
    
        /**
         * Takes the errorObj from the tag checker and transforms it into errorobjects usable by analysisToVisObj 
         * @param {Object} errorObj errorObject from the tagChecker
         */
        buildAccessibilityErrors(errorObj){
            for(var door of errorObj.doorBasicErrors){
                if (door.error === "falseValue"){ //error: door has a false value in wheelchair tag
                    this.accDoorErrorBasic.push(makeErrorObj("ACCDOORBASIC-2",[door.door,"wheelchair"],[]));
                }
                if(door.error==="noTag"){ //error: door missees the wheelchair tag
                    this.accDoorErrorBasic.push(makeErrorObj("ACCDOORBASIC-1",[door.door,"wheelchair"],[]));
                }
            }
    
            for (var doorP of errorObj.doorPremiumErrors){
                if (doorP.error === "falseWidthValue"){ //error: door has false value type in width tag
                    this.accDoorErrorPremium.push(makeErrorObj("ACCDOORPREMIUM-2",[doorP.doorPremium,"width"],[]));
                }
                if(doorP.error==="noWidth"){ //error: door misses width tag
                    this.accDoorErrorPremium.push(makeErrorObj("ACCDOORPREMIUM-1",[doorP.doorPremium,"width"],[]));
                }
            }
    
            for (var ramp of errorObj.rampBasicErrors){
                if(ramp.error==="falseValue"){  //error: ramp tag has unsuitable value
                    this.accRampErrorBasic.push(makeErrorObj("ACCRAMPBASIC-2",[ramp.ramp,"ramp"],[]));
                }
                if(ramp.error==="noTag"){ //error: ramp misses ramp tag
                    this.accRampErrorBasic.push(makeErrorObj("ACCRAMPBASIC-1",[ramp.ramp,"ramp"],[]));
                }
            }
    
            for (var rampP of errorObj.rampPremiumErrors){
                if(rampP.error==="falseRampWheelchairValue"){ //error: unsuitable value in tag ramp:wheelchair
                    this.accRampErrorPremium.push(makeErrorObj("ACCRAMPPREMIUM-2",[rampP.rampPremium,"ramp:wheelchair"],[]));
                }
                if(rampP.error==="noTag"){ //error: no tag ramp:wheelchair
                    this.accRampErrorPremium.push(makeErrorObj("ACCRAMPPREMIUM-1",[rampP.rampPremium,"ramp:wheelchair"],[]));
                }
            }

            //basic elevator tag errors
            for (var elev of errorObj.elevBasicErrors){
                switch (elev.error){
                    case "noTactileWriting":  //error: elevator misses tag tactile writing
                        this.accElevErrorBasic.push(makeErrorObj("ACCELEVBASIC-1", [elev.elev,"tactile_writing"],[]));
                        break;
                    case "falseWheelchairValue": //error: elevator has unsuitable value in wheelchair tag
                        this.accElevErrorBasic.push(makeErrorObj("ACCELEVBASIC-2", [elev.elev,"wheelchair"],[]));
                        break;
                    case "noWheelchair": //error: elevator misses wheelchair tag
                        this.accElevErrorBasic.push(makeErrorObj("ACCELEVBASIC-1", [elev.elev, "wheelchair"],[]));
                        break;
                    case "noTags": //error: elevator misses wheelchair and tactile writing tag
                        this.accElevErrorBasic.push(makeErrorObj("ACCELEVBASIC-1", [elev.elev,"tactile_writing"],[]));
                        this.accElevErrorBasic.push(makeErrorObj("ACCELEVBASIC-1", [elev.elev, "wheelchair"],[]));
                        break;
                    default:
                        break;
                }
            }
    
            //premium elevator tag errors
            for (var elevP of errorObj.elevPremiumErrors){
                switch (elevP.error){
                    case "noHandrail": //error: elevator has no tag handrail
                        this.accElevErrorPremium.push(makeErrorObj("ACCELEVPREMIUM-1", [elevP.elevPremium,"handrail"],[]));
                        break;
                    case "falseHandrail": //error: elevator has not suitable value in tag handrail
                        this.accElevErrorPremium.push(makeErrorObj("ACCELEVPREMIUM-2", [elevP.elevPremium,"handrail"],[]));
                        break;
                    case "noWidth": //error: elevator misses tag width
                        this.accElevErrorPremium.push(makeErrorObj("ACCELEVPREMIUM-1", [elevP.elevPremium, "width"],[]));
                        break;
                    case "falseWidth": //error: elevator has not suitable value in width tag
                        this.accElevErrorPremium.push(makeErrorObj("ACCELEVPREMIUM-2", [elevP.elevPremium, "width"],[]));
                        break;
                    case "noLength": //error: elevator misses length tag
                        this.accElevErrorPremium.push(makeErrorObj("ACCELEVPREMIUM-1", [elevP.elevPremium, "length"],[]));
                        break;
                    case "falseLength":  //error: elevator has not suitable value in length tag
                        this.accElevErrorPremium.push(makeErrorObj("ACCELEVPREMIUM-2", [elevP.elevPremium, "length"],[]));
                        break;
                    case "noAudio": //error: elevator misses audio tag
                        this.accElevErrorPremium.push(makeErrorObj("ACCELEVPREMIUM-1", [elevP.elevPremium, "audio_announcement"],[]));
                        break;
                    case "falseAudio": //error: elevator has not suitable value in audio tag
                        this.accElevErrorPremium.push(makeErrorObj("ACCELEVPREMIUM-2", [elevP.elevPremium, "audio_announcement"],[]));
                        break;
                    default:
                        break;
                }
            }
    
            //stair basic tag errors
            for (var stairs of errorObj.stairsBasicErrors){
                switch (stairs.error){
                    case "noTactileWriting":  //error: stairs has no tactile writing tag
                        this.accStairsErrorBasic.push(makeErrorObj("ACCSTAIRSBASIC-1", [stairs.stairs,"tactile_writing"],[]));
                        break;
                    case "falseRampValue":  //error:stairs have not suitable value in ramp tag
                        this.accStairsErrorBasic.push(makeErrorObj("ACCSTAIRSBASIC-2", [stairs.stairs,"ramp:wheelchair"],[]));
                        break;
                    case "noRamp:wheelchair": //error: ramp:wheelchair tag is missing
                        this.accStairsErrorBasic.push(makeErrorObj("ACCSTAIRSBASIC-1", [stairs.stairs, "ramp:wheelchair"],[]));
                        break;
                    case "noTags":  //error:tactile writing and ramp:wheelchair tag are missing
                        this.accStairsErrorBasic.push(makeErrorObj("ACCSTAIRSBASIC-1", [stairs.stairs,"tactile_writing"],[]));
                        this.accStairsErrorBasic.push(makeErrorObj("ACCSTAIRSBASIC-1", [stairs.stairs, "ramp:wheelchair"],[]));
                        break;
                    default:
                        break;
                }
            }
    
            //stair premium tag errors
            for (var stairsP of errorObj.stairsPremiumErrors){
                switch (stairsP.error){
                    case "noHandrail": //error: handrail tag is missing
                        this.accStairsErrorPremium.push(makeErrorObj("ACCSTAIRSPREMIUM-1", [stairsP.stairsPremium,"handrail"],[]));
                        break;
                    case "falseHandrail": //error: handrail tag has unsuitable value
                        this.accStairsErrorPremium.push(makeErrorObj("ACCSTAIRSPREMIUM-2", [stairsP.stairsPremium,"handrail"],[]));
                        break;
                    case "noWidth": //error: width tag is missing
                        this.accStairsErrorPremium.push(makeErrorObj("ACCSTAIRSPREMIUM-1", [stairsP.stairsPremium, "width"],[]));
                        break;
                    case "falseWidth": //error: width tag has unsuitable value
                        this.accStairsErrorPremium.push(makeErrorObj("ACCSTAIRSPREMIUM-2", [stairsP.stairsPremium,"width"],[]));
                        break;
                    case "noPaving": //error:  tactile_paving tag is missing
                        this.accStairsErrorPremium.push(makeErrorObj("ACCSTAIRSPREMIUM-1", [stairsP.stairsPremium, "tactile_paving"],[]));
                        break;
                    case "falsePaving": //error: tactile paving tag has unsuitable value
                        this.accStairsErrorPremium.push(makeErrorObj("ACCSTAIRSPREMIUM-2", [stairsP.stairsPremium,"tactile_paving"],[]));
                        break;
                    case "falseConveying": //error: conveying tag has unsuitable value (if it exists)
                        this.accStairsErrorPremium.push(makeErrorObj("ACCSTAIRSPREMIUM-2", [stairsP.stairsPremium, "conveying"],[]));
                        break;
                    default:
                        break;
                }
            }
    
            //toilet tag errors
            for (var toilet of errorObj.toiletErrors){
                switch(toilet.error){
                    case "falseWheelchairValue": //error: wheelchair tag has unsuitable value
                        this.accWC.push(makeErrorObj("ACCWC-2", [toilet.wc,"wheelchair"],[]));
                        break;
                    case "noWheelchairTag": //error: wheelchair tag is missing
                        this.accWC.push(makeErrorObj("ACCWC-1", [toilet.wc,"wheelchair"],[]));
                        break;
                    case "noTwTag": //error: tactile writing tag is missing
                        this.accWC.push(makeErrorObj("ACCWC-1", [toilet.wc,"tactile_writing"],[]));
                        break;
                    default:
                        break;
                }
            }
    

            for (var paving of errorObj.pavingErrors){
                if(paving.error === "noTpTag"){  //error: paving object has no tactile_paving tag
                    this.accTAC.push(makeErrorObj("ACCTAC-1", [paving.tactileObj, "tactile_paving"],[]))
                }
            }
    
            for (var writing of errorObj.writingErrors){
                if(writing.error === "noTwTag"){ //error: writable object has no tactile_writing tag
                    this.accTAC.push(makeErrorObj("ACCTAC-1", [writing.tactileObj, "tactile_writing"],[]))
                }
            }
        }

        //here
        /**
         * Takes the errorObj from the tag checker and calculates the percentages/100 for each accessibility error-type. Sum of wrong objects/sum of all relevant objects
         * @param {Object} errorObj errorObject from the tagChecker
         */
        buildAccPercentages(errorObj){
            this.accDoorBasicPercentage = 1-(this.tagChecker.basicErrorDoorIDs.size / this.correctSITTypeObjects.doors.length);
            this.accDoorPremiumPercentage = 1-(this.tagChecker.premErrorDoorIDs.size / this.correctSITTypeObjects.doors.length);
            if(this.correctSITTypeObjects.doors.length===0){
                this.accDoorBasicPercentage=1;
                this.accDoorPremiumPercentage=1;
            }

            this.accStairsBasicPercentage = 1-(this.tagChecker.basicErrorStairsIDs.size / this.tagChecker.allRamps.length); //allRamps includes all stairs, ramp error ids are added to the stair set in the tagChecker
            this.accStairsPremiumPercentage = 1-(this.tagChecker.premErrorStairsIDs.size / this.tagChecker.allRamps.length);//allRamps includes all stairs ramp error ids are added to the stair set in the tagChecker
            if(this.tagChecker.allRamps.length===0){ //allRamps includes all stairs
                this.accStairsPremiumPercentage=1;
                this.accStairsBasicPercentage=1;
            }

            this.accElevBasicPercentage = 1-(this.tagChecker.basicErrorElevIDs.size / this.tagChecker.allElev.length);
            this.accElevPremiumPercentage = 1-(this.tagChecker.premErrorElevIDs.size / this.tagChecker.allElev.length);
            

            if(this.tagChecker.allElev.length===0){
                this.accElevBasicPercentage=1;
                this.accElevPremiumPercentage=1;
            }

            this.accWCPercentage = 1-(this.tagChecker.toiletteErrorIDs.size / this.tagChecker.allWC.length);
            if(this.tagChecker.allWC.length===0){
                this.accWCPercentage=1
            }

            this.accTACPercentage = 1-(this.tagChecker.tacErrorIDs.size / (this.tagChecker.tacErrorIDs.size + this.tagChecker.tacCorrectIDs.size)); 

            if(this.correctSITTypeObjects.corridors.length+this.correctSITTypeObjects.areas.length+this.correctSITTypeObjects.doors.length===0){
                this.accTACPercentage=1;
            }
        }

}

export {TAGAnalyzer};