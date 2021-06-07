import {getLevelsAsNumbers, getLevelsAsNumbersFromString} from "../utils_own";
import { tag } from "@turf/turf";

const { Component } = require("react");
class TagChecker extends Component {
    /**
     * Constructor
     * @param {Object} building the building object for which the tags shall be checked. 
     */
    constructor (building){
        super();
        this.building = building;
    }


    /**
     * Checks the building tag for correct SIT value
     * @return {Object} Object with the information if the building tag exists and which errors it has
     */
    checkBuilding(){
        var building = this.building;
        var tags = building.properties.tags;
        if(tags.building){
            if(/^[a-zA-Z_;]+$/.test(tags.building)){  //the regex tests for letters, _, ; and spaces
                return{"building" : true}   //returns true, if it matches, no error is needed
            }
            else{
                return{"building" : true, "tag" : tags.building} //returns also the tag, if the value of the tag is incorrect
            }
        }
        else{
            return{"building" : false} //returns false if building tag does not exist
        };
    }


    /**
     * Checks the door tags for its values in regards to SIT.
     * @param {Object} doors the featurelist of the doors to check.
     * @return {Array} Array of doors with a not SIT conform value.
     */
    checkDoors(doors){
        var falseDoors = [];
        //loop through doors, for each door check if value matches  /^[a-zA-Z_\;\ ]+$/
        for (var door of doors){
            if(!/^[a-zA-Z_;]+$/.test(door.properties.tags.door)){ //regex analog to building
                falseDoors.push(door.id) //if the value does not match, push the id into return array
            }
        }
        return falseDoors; //return the array of doors with wrong values
        
    }

    /**
     * Checks if the level or repeat_on tag of a given feature list is correct according to the this.building and sit rules.
     * idea: loop through every object and check if it either has level or repeat_on if not return exitance error. check if values are parseable, if not return error this value is not in right numbering scheme. if it is parseable, check if it is correct in correlation to min/max/non_existing.
     * @param {Object} features featurelist of features to check for the level tag.
     * @return {Array} Array of Errorobjects.
     */
    checkLevel(features){
        var falseLevelTags = [];
        var acceptableLevels = [];
        for (var i = this.minlevel;i<=this.maxlevel;i++){
            acceptableLevels.push(i); //create an array with all levels between min and max
        }
        var that = this;
        const filteredArray = acceptableLevels.filter(function(x) { 
            return that.non_existent_levels.indexOf(x) < 0; //delete all non existing levels from the accaptable levels array
        });
        acceptableLevels = filteredArray;
        this.acceptableLevels = acceptableLevels; //set the property
        for(var feature of features){
            if(feature.properties.tags.level&&feature.properties.tags.repeat_on){
                falseLevelTags.push({"id" : feature.id, "error" : "bothTags"}); //add this error if feature has both tags
                continue;
            }
            var levels = getLevelsAsNumbers(feature);
            if(!feature.properties.tags.level && !feature.properties.tags.repeat_on){
                falseLevelTags.push({"id" : feature.id, "error" : "noTags"}); // add this error if  feature has neither tag
            }
            else if(levels === false){
                falseLevelTags.push({"id" : feature.id, "error" : "falseNumbers"}); // add this error if feature has a wrong value in the tag
            }
            else if(!levels.every(r => this.acceptableLevels.includes(r))){
                falseLevelTags.push({"id" : feature.id, "error" : "nonExistingLevel"});//add this error if feature has a leel in its tag wich does not exist
            }

        }
        return falseLevelTags; //return the error list

        
    }

    /**
     * Checks the min and max_level tags for existence and correctness.
     * @return {Object} Errorobject with the information about min and max_level tag errors.
     */
    checkMinMaxLevel(){
        var building=this.building;
        var tags = building.properties.tags;
        var retObj = {"min" : false, "max" : false}
        var minIsNumber=false;
        var maxIsNumber=false;
        if(tags.min_level){ //check if min_level exists
            retObj.min=true;
            if(isNaN(tags.min_level)){ //check if min level is a number
                var newRetObj = {...retObj, "minTag" : tags.min_level};//if min level is not a number, return value of min level
                retObj=newRetObj;
                this.minlevel=0; //set property
            }
            else{
                this.minlevel=parseInt(tags.min_level); //set property
                minIsNumber=true; //set number flag
            }
           
        }
        if(tags.max_level){ //analog to min level
                
            retObj.max=true;
            if(isNaN(tags.max_level)){
                var newRetObj2 = {...retObj, "maxTag" : tags.max_level};
                retObj=newRetObj2;
                this.maxlevel=0;
            }
            else{
                this.maxlevel=parseInt(tags.max_level);
                maxIsNumber=true;
            }
        }
        if(minIsNumber&&maxIsNumber&&parseInt(tags.min_level)>parseInt(tags.max_level)){ //check if min and max level are numbers and if min is greater than max
            var newRetObj3 = {...retObj, "minGreaterMax" : true}; //if thats true, return acordingly
                retObj=newRetObj3;
        }
        return retObj;
        }

    /**
     * Checks the non_existent_level tag for existence and correctness.
     * @return {Object} Errorobject with information about the Non_existent:levels tag errors.
     */
    checkNonExistingLevel(){
        var building=this.building;
        var tags = building.properties.tags;
        if(tags.non_existent_levels){
            if (/^-?\d+(?:--?\d+)?(?:;-?\d+(?:--?\d+)?)*$/.test(tags.non_existent_levels)){ //regex checks for all numbering schemes allowed by SIT
                this.non_existent_levels = getLevelsAsNumbersFromString(tags.non_existent_levels); //if it passes test, set property to parsed function
                return true
            }
            else{
                this.non_existent_levels=[]; //if not set property empty
                return tags.non_existent_levels; //return value of tag, because it is wrong
            }
        }
        else{
            this.non_existent_levels=[];//set property empty because tagdoes not exist
            return false;
        }
    }

    /**
     * Startingpoint for the tag checking of the accessibility tags. Here all subroutines get called.
     * @param {Object} doors the Featurelist of the doors.
     * @param {Object} features list of features.
     * @param {Object} areas the featurelist of areas.
     * @param {Object} corridors the featurelist of corridors.
     * @return {Object} the Errorobject with all accessibility error objects.
     */
    checkAccessibility(doors, features, areas, corridors){
        //features sort by type with no errors, regarding to basic conformity:
        this.basicDoors = [];
        this.basicStairs = [];
        this.basicRamps = [];
        this.basicElev = [];
        //Collection of features by type:
        this.allWC = [];
        this.allRamps=[];
        this.allStairs=[];
        this.allElev=[];
        //sets of feature ids with errors regarding basic conformity
        this.basicErrorDoorIDs = new Set();
        this.basicErrorRampIDs = new Set();
        this.basicErrorElevIDs = new Set();
        this.basicErrorStairsIDs = new Set();
        //sets of feature ids with errors regarding premium conformity
        this.premErrorDoorIDs = new Set();
        this.premErrorElevIDs = new Set();
        this.premErrorStairsIDs = new Set();
        this.premErrorRampIDs = new Set();
        //sets of feature ids with errors regarding conformity
        this.toiletteErrorIDs = new Set();
        this.tacErrorIDs = new Set();
        this.tacCorrectIDs = new Set();
        this.sortFeatures(features);
        let doorsBasic = this.checkDoorsBasic(doors);
        let rampBasic = this.checkRampBasic();
        let elevBasic = this.checkElevBasic();
        let stairsBasic = this.checkStairBasic();
        let doorsPremium = this.checkDoorsPremium(doors);
        let rampPremium = this.checkRampPremium();
        let elevPremium = this.checkElevPremium();
        let stairsPremium = this.checkStairsPremium();
        let toilets = this.checkToilets();
        let paving = this.checkPaving(areas,corridors);
        let writing = this.checkWriting(doors);
        return {"doorBasicErrors" : doorsBasic, "doorPremiumErrors" : doorsPremium, "rampBasicErrors" : rampBasic, "rampPremiumErrors" : rampPremium, "elevBasicErrors" : elevBasic, "elevPremiumErrors" : elevPremium, "stairsBasicErrors" : stairsBasic, "stairsPremiumErrors" : stairsPremium, "toiletErrors" : toilets, "pavingErrors" : paving, "writingErrors" : writing}
    }

    /**
     * Sorts features into types by its tags and write those into Object properties.
     * @param {Object} features featurelist.
     */
    sortFeatures(features){
        for (var feature of features){
            var tags= feature.properties.tags;
            if(tags.stairs||tags.highway==="footway"){
                this.allRamps.push(feature);
            }
            if(tags.stairs){
                this.allStairs.push(feature);
            }
            if(tags.highway==="elevator"){
                this.allElev.push(feature);
            }
            if(tags.room ==="toilets"||tags.room ==="toilet"||tags.amenity==="toilets"){
                this.allWC.push(feature);
            }
        }
    }

    /**
     * Checks the basic conformity conditions for doors.
     * @param {Object} doors featurelist of the doors.
     * @return {Array} Array of all doors which have errors and those errors as an Object.
     */
    checkDoorsBasic(doors){
        var returnArray=[];
        for (var door of doors){
            if(door.properties.tags.wheelchair){
                var wheelchairTag = door.properties.tags.wheelchair;
                if(wheelchairTag === "yes"||wheelchairTag==="no"||wheelchairTag==="limited"||wheelchairTag==="designated"){
                    this.basicDoors.push(door);
                }
                else{
                    returnArray.push({"door" : door.id, "error" : "falseValue"})
                    this.basicErrorDoorIDs.add(door.id);
                }
            }
            else{
                returnArray.push({"door":door.id, "error" : "noTag"})
                this.basicErrorDoorIDs.add(door.id);
            }
        }
        return returnArray;
    }

    /**
     * Checks the advanced conformity conditions for doors.
     * @param {Object} doors Featurelist of doors.
     * @return {Array} Array of all doors which have errors and those errors as an Object.
     */
    checkDoorsPremium(doors){
        var returnArray = [];
        for(var door of doors){
            var tags = door.properties.tags;
            if(tags.width){
                if(Number(tags.width).isNaN){
                    returnArray.push({"doorPremium":door.id, "error" : "falseWidthValue"})
                    this.premErrorDoorIDs.add(door.id);
                }
            }
            else{
                returnArray.push({"doorPremium":door.id, "error" : "noWidth"})
                this.premErrorDoorIDs.add(door.id);
            }
        }
        return returnArray;
    }

    /**
     * Checks the basic conformity conditions for ramps.
     * @return {Array} Array of the errorobjects for the ramps.
     */
    checkRampBasic(){
        var returnArray=[];
        for (var feature of this.allRamps){
            if(feature.properties.tags.ramp){
                var rampTag = feature.properties.tags.ramp;
            
                if(rampTag === "yes"||rampTag==="no"){
                    this.basicRamps.push(feature);
                }
                else{
                    returnArray.push({"ramp" : feature.id, "error" : "falseValue"})
                    this.basicErrorStairsIDs.add(feature.id);
                }
            }
        
            else{
                returnArray.push({"ramp":feature.id, "error" : "noTag"})
                this.basicErrorStairsIDs.add(feature.id);
            }
        }
        return returnArray;
    }

    /**
     * Checks the advanced conformity conditions for ramps.
     * @return {Array} Array of the errorobjects for the ramps.
     */
    checkRampPremium(){
        var returnArray = [];
        for (var ramp of this.allRamps){
            var tags = ramp.properties.tags;
            if(tags["ramp:wheelchair"]&&(!tags["ramp:wheelchair"]==="yes"||tags["ramp:wheelchair"]==="no")){
                returnArray.push({"rampPremium" : ramp.id, "error" : "falseRampWheelchairValue"})
                this.premErrorStairsIDs.add(ramp.id);
            }
            if(!tags["ramp:wheelchair"]){
                returnArray.push({"rampPremium":ramp.id, "error" : "noTag"})
                this.premErrorStairsIDs.add(ramp.id);
            }
        }
        return returnArray;
    }

    /**
     * checks the basic conformity conditions for elevators
     * @return {Array} Array of the errorobjects for the elevators.
     */
    checkElevBasic(){
        var returnArray=[];
        for (var feature of this.allElev){
            if(feature.properties.tags.wheelchair){
                var wheelchairTag = feature.properties.tags.wheelchair;
            
                if((wheelchairTag === "yes"||wheelchairTag==="no"||wheelchairTag==="limited"||wheelchairTag==="designated")&&feature.properties.tags.tactile_writing){
                    this.basicElev.push(feature);
                }
                else if(wheelchairTag === "yes"||wheelchairTag==="no"||wheelchairTag==="limited"||wheelchairTag==="designated"){
                    returnArray.push({"elev" : feature.id, "error" : "noTactileWriting"})
                    this.basicErrorElevIDs.add(feature.id);
                }
                else if(feature.properties.tags.tactile_writing){
                    returnArray.push({"elev":feature.id, "error" : "falseWheelchairValue"})
                    this.basicErrorElevIDs.add(feature.id);
                }
            }
        
            else if(feature.properties.tags.tactile_writing){
                returnArray.push({"elev":feature.id, "error" : "noWheelchair"})
                this.basicErrorElevIDs.add(feature.id);
            }

            else{
                returnArray.push({"elev":feature.id, "error" : "noTags"})
                this.basicErrorElevIDs.add(feature.id);
            }
        }
        return returnArray;

    }

    /**
     * checks the advanced conformity conditions for elevators
     * @return {Array} Array of the errorobjects for the elevators.
     */
    checkElevPremium(){
        var returnArray=[];
        for (var elev of this.allElev){
            var tags=elev.properties.tags;
            if(!tags.handrail&&!tags["handrail:left"]&&!tags["handrail:right"]&&!tags["handrail:center"]){
                returnArray.push({"elevPremium":elev.id, "error" : "noHandrail"})
                this.premErrorElevIDs.add(elev.id);
            }
            if((tags.handrail&&!tags["handrail:left"]&&!tags["handrail:right"]&&!tags["handrail:center"])&&!(tags.handrail==="yes"||tags.handrail==="no"||tags["handrail:left"]==="yes"||tags["handrail:right"]==="yes"||tags["handrail:center"]==="yes")){
                returnArray.push({"elevPremium":elev.id, "error" : "falseHandrail"})
                this.premErrorElevIDs.add(elev.id);
            }
            if(!tags.width){                
                returnArray.push({"elevPremium":elev.id, "error" : "noWidth"})
                this.premErrorElevIDs.add(elev.id);
            }
            if(tags.width){
                if(Number(tags.width).isNaN){
                    returnArray.push({"elevPremium":elev.id, "error" : "falseWidth"})
                    this.premErrorElevIDs.add(elev.id);
                }
            }
            if(!tags.length){
                returnArray.push({"elevPremium":elev.id, "error" : "noLength"})
                this.premErrorElevIDs.add(elev.id);
            }
            if(tags.length){
                if(Number(tags.length).isNaN){
                    returnArray.push({"elevPremium":elev.id, "error" : "falseLength"})
                    this.premErrorElevIDs.add(elev.id);
                }
            }
            if(!tags.audio_announcement){
                returnArray.push({"elevPremium":elev.id, "error" : "noAudio"})
                this.premErrorElevIDs.add(elev.id);
            }
            if(tags.audio_announcement&&!(tags.audio_announcement==="yes"||tags.audio_announcement==="no")){
                returnArray.push({"elevPremium":elev.id, "error" : "falseAudio"})
                this.premErrorElevIDs.add(elev.id);
            }
        }
        return returnArray;
    }

    /**
     * checks the basic conformity conditions for stairs.
     * @return {Array} Array of the Errorobjects for the stairs.
     */
    checkStairBasic(){
        var returnArray=[];
        for (var feature of this.allStairs){
            if(feature.properties.tags["ramp:wheelchair"]&&!feature.properties.tags.tactile_writing){
                var wheelchairTag = feature.properties.tags["ramp:wheelchair"];
            
                if((wheelchairTag === "yes"||wheelchairTag==="no")&&feature.properties.tags.tactile_writing){
                    this.basicStairs.push(feature);
                }
                else if(wheelchairTag === "yes"||wheelchairTag==="no"){
                    returnArray.push({"stairs" : feature.id, "error" : "noTactileWriting"})
                    this.basicErrorStairsIDs.add(feature.id);
                }
                else if(feature.properties.tags.tactile_writing){
                    returnArray.push({"tairs":feature.id, "error" : "falseRampValue"})
                    this.basicErrorStairsIDs.add(feature.id);
                }
            }
        
            else if(feature.properties.tags.tactile_writing){
                returnArray.push({"stairs":feature.id, "error" : "noRamp:wheelchair"})
                this.basicErrorStairsIDs.add(feature.id);
            }
            else{
                returnArray.push({"stairs":feature.id, "error" : "noTags"})
                this.basicErrorStairsIDs.add(feature.id);
            }
        }
        return returnArray;
    }

    /**
     * checks the advanced conformity conditions for stairs.
     * @return {Array} Array of the Errorobjects for the stairs.
     */
    checkStairsPremium(){
        var returnArray=[];
        for (var stair of this.allStairs){
            var tags=stair.properties.tags;
            if(!tags.handrail&&!tags["handrail:left"]&&!tags["handrail:right"]&&!tags["handrail:center"]){
                returnArray.push({"stairsPremium":stair.id, "error" : "noHandrail"})
                this.premErrorStairsIDs.add(stair.id);
            }
            if((tags.handrail&&!tags["handrail:left"]&&!tags["handrail:right"]&&!tags["handrail:center"])&&!(tags.handrail==="yes"||tags.handrail==="no"||tags["handrail:left"]==="yes"||tags["handrail:right"]==="yes"||tags["handrail:center"]==="yes")){
                returnArray.push({"stairsPremium":stair.id, "error" : "falseHandrail"})
                this.premErrorStairsIDs.add(stair.id);
            }
            if(!tags.width){                
                returnArray.push({"stairsPremium":stair.id, "error" : "noWidth"})
                this.premErrorStairsIDs.add(stair.id);
            }
            if(tags.width){
                if(Number(tags.width).isNaN){
                    returnArray.push({"stairsPremium":stair.id, "error" : "falseWidth"})
                    this.premErrorStairsIDs.add(stair.id);
                }
            }
            if(!tags.tactile_paving){
                returnArray.push({"stairsPremium":stair.id, "error" : "noPaving"})
                this.premErrorStairsIDs.add(stair.id);
            }
            if(tags.tactile_paving&&!(tags.tactile_paving==="yes"||tags.tactile_paving==="no")){
                returnArray.push({"elevPremium":stair.id, "error" : "falsePaving"})
                this.premErrorStairsIDs.add(stair.id);
            }

            //no check for existence of conveying, because it is not a must have
            if(tags.conveying&&!(tags.conveying==="yes"||tags.conveying==="forward"||tags.conveying==="backward"||tags.conveying==="reversible")){
                returnArray.push({"elevPremium":stair.id, "error" : "falseConveying"})
                this.premErrorStairsIDs.add(stair.id);
            }
        }
        return returnArray;
    }

    /**
     * checks the conformity conditions for toilets.
     * @return {Array} Array of the errorobjects for the toilets.
     */
    checkToilets(){
        var returnArray=[];
        for (var wc of this.allWC){
            var tags = wc.properties.tags;
            var wheelchairTag = tags.wheelchair;
            var twTag = tags.tactile_writing;
            if(wheelchairTag){
                if(!(wheelchairTag === "yes"||wheelchairTag==="no"||wheelchairTag==="limited"||wheelchairTag==="designated")){
                    returnArray.push({"wc" : wc.id, "error" : "falseWheelchairValue"})
                    this.toiletteErrorIDs.add(wc.id);
                }
            }
            else{
                returnArray.push({"wc" : wc.id, "error" : "noWheelchairTag"})
                this.toiletteErrorIDs.add(wc.id);
            }
            if(!twTag){
                returnArray.push({"wc" : wc.id, "error" : "noTwTag"})
                this.toiletteErrorIDs.add(wc.id);
            }
        }
        return returnArray;
    }

    /**
     * Checks the conformity conditions for tactile_paving tags.
     * @param {Object} areas Featurelist of the areas.
     * @param {Object} corridors Featurelist of the corridors.
     * @return {Array} Array of the Errorobjects.
     */
    checkPaving(areas,corridors){
        var returnArray=[];
        var objToCheck = areas.concat(corridors);
        for (var obj of objToCheck){
            if(!obj.properties.tags.tactile_paving){
                returnArray.push({"tactileObj" : obj.id, "error" : "noTpTag"});
                this.tacErrorIDs.add(obj.id);
            }
            else{
                this.tacCorrectIDs.add(obj.id);
            }
        }
        return returnArray;
    }

    /**
     * Checks the conformity of tactile writing tags.
     * @param {Object} doors featurelist of the doors.
     * @return {Array} Array of the errorobjects.
     */
    checkWriting(doors){
        var returnArray = [];
        var objToCheck = doors.concat(this.allElev,this.allStairs,this.allWC);
        for(var obj of objToCheck){
            if(!obj.properties.tags.tactile_writing){
                returnArray.push({"tactileObj" : obj.id, "error" : "noTwTag"});
                this.tacErrorIDs.add(obj.id);
            }
            else{
                this.tacCorrectIDs.add(obj.id);
            }
        }
        return returnArray;
    }
}

export default TagChecker;