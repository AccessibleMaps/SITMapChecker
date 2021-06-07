import coverage from "./coverage"
import { makeErrorObj } from "../utils_own";
import {TAGAnalyzer} from "../ctrl/TagCtrl";
import NavigationControl from '../ctrl/NavigationControl';


// creates a building object for the selected building as specified in ../sampleData/sampleBuilding.json
// covered achievements: Entrance, Door, Level Reachability, Indoor Reachability, Coverage 
// buildingWithLevels: The building to analyse.
// map: Basis for analysis with NavigationControl.
// sitAnalyzer: Basis for analysis of SIT conformity aside from checking tags.
function analysisToVisObj(buildingWithLevels, map, sitAnalyzer){
    let buildingObj = buildingWithLevels.building;

    // the object to be returned
    let currentBuilding = {
        selected:   true,
        name:       buildingObj.properties.tags.hasOwnProperty("name") ? buildingObj.properties.tags.name : "none",
        type:       !buildingObj.properties.tags.hasOwnProperty("building") ? "none" : buildingObj.properties.tags.building !== "yes" ? buildingObj.properties.tags.building : "no specific type",
        buildingObjects: buildingWithLevels
    }

    // Calculate Coverage (sit, levels) and add them to currentBuilding.
    // Not creation of coverage achievement! See first step for achievements for that.
    addCoverageInfo(currentBuilding, buildingWithLevels);

    /* achievements */
    var UItext = require("./UItext.json");
    var achievements = [];

    addCoverageAchievement(currentBuilding, achievements, UItext);
    var tagAnalyzer = addSITConfAchievement(buildingObj, achievements, UItext, sitAnalyzer);
    addAccessibilityAchievements(tagAnalyzer, achievements, UItext);
    var navigationControl = new NavigationControl(map, buildingWithLevels, sitAnalyzer.correctSITTypeObjects);
    addNavigabilityAchievements(buildingWithLevels, navigationControl, achievements, UItext);
    
    for (const achievement of achievements){
        let fulfillable = true;
        for (const precondition of achievement.precondition){
            for (const comparisonAchievement of achievements){
                if (comparisonAchievement.achievementId === precondition){
                    if (!comparisonAchievement.fulfilled){
                        fulfillable = false;
                        break;
                    }
                }
            }
            if (!fulfillable){
                break;
            }
        }
        achievement.fulfillable = fulfillable;
    }

    currentBuilding.achievements = achievements;
    currentBuilding.buildingId = buildingObj.id;

    // Return objects to be used in rendering the UI.
    return {
        "currentBuilding": currentBuilding,
        "navigationControl": navigationControl
    };
}

// Adds the percentages of covered areas ('coverage') for the whole building & per level
// to the currentBuilding object, which contains the information to be displayed in the UI.
function addCoverageInfo(currentBuilding, buildingWithLevels){
    
    // For now, coverage will be applied to all levels of a building.
    // An idea was to let the user choose which levels it should be applied to.
    var selectedCoverageLevels = [];
    for (const levelObj of buildingWithLevels.levels){
        selectedCoverageLevels.push(levelObj.level);
    }

    
    // Get coverages for the whole building & per level. 
    var coverageEvaluator = new coverage();
    /*	stores an Array of 4 variables
	*		1. Array with coverage percentage per level
	*		2. cover percentage of the total building
	*		3. Array of Polygons of all tagged areas per level
	*		4. Array of Polygons of all untagged areas per level
	*/
    var coverageEvalutation = coverageEvaluator.getArea(buildingWithLevels.building, selectedCoverageLevels);
    if(!coverageEvalutation) return;
    var buildingCoverage = coverageEvalutation[1];
    var levelCoverages = coverageEvalutation[0];

    // Set coverage values in currentBuilding object.
    currentBuilding.sitCoverage = Math.round((buildingCoverage + Number.EPSILON) * 100) / 100;
    currentBuilding.levelCoverages = [];
    for (let i = 0; i < levelCoverages.length; i++){
        currentBuilding.levelCoverages.push([buildingWithLevels.levels[i].level, Math.round((levelCoverages[i] + Number.EPSILON) * 100) / 100]);
    }
}

// Adds the coverage achievement to the achievement list of the current building.
// Also adds coverage information aside from achievement information to the currentBuilding object, which
// contains the information to be displayed when viewing a single building.
function addCoverageAchievement(currentBuilding, achievements, UItext){
    
    var cov = {
        achievementId: "COV"
    };
    
    applyStaticAchievementProperties(UItext, cov);
    cov.tasks = [];
    cov.currentStatus = (currentBuilding.sitCoverage / 100) * 100;
    cov.currentStatus === 100 ? cov.fulfilled = true : cov.fulfilled = false; 
    
    cov.tasks.push(createTask(UItext.COV.tasks["COV-1"], []));
    achievements.push(cov);
}

// Creates the SIT conformity achievement and adds it to the currentBuilding object, which contains
// the information to be displayed when viewing a single building.
function addSITConfAchievement(building, achievements, UItext, sitAnalyzer){

    var sitConf = {
        achievementId:  "SIT"
    }
    applyStaticAchievementProperties(UItext, sitConf);
    sitConf.tasks = [];

    // Analysis of geometrical and typing errors.
    sitAnalyzer.analyzeBuilding(building);
    
    // Analysis of erroneous tags.
    var tagAnalyzer = new TAGAnalyzer(sitAnalyzer.correctSITTypeObjects, building);
    tagAnalyzer.checkTagsForSIT();  
    sitAnalyzer.addTagNonConformObjects(tagAnalyzer.nonConformObjects);

    // Trigger calculation of percentage (*100) of SIT conform objects and add this info to the achievement object.
    sitAnalyzer.finishBuildingAnalysis(building);
    sitConf.currentStatus = sitAnalyzer.sitConfStatus;
    sitConf.currentStatus === 100 ? sitConf.fulfilled = true : sitConf.fulfilled = false;

    // Add tasks for sitAnalyzer errors.
    sitConf.tasks.push(createTask(UItext.SIT.tasks["INTERSECT-X"], sitAnalyzer.intersectErrors));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["BUILDING-OVERLAP-X"], sitAnalyzer.buildingOverlapErrors[building.id]));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["DOORLVL-1"], sitAnalyzer.doorNoWallErrors.concat(sitAnalyzer.doorMultiLevelErrors)));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["POLY-X"], sitAnalyzer.polygonErrors));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["MULTIPOLY-X"], sitAnalyzer.multipolygonErrors));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["TYPE-X"], sitAnalyzer.geometrySITTypeInconsistencyErrors));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["BUILDING-INTERSECT-X"], sitAnalyzer.buildingBordersIntersectErrors));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["LVLOVERLAP-X"], sitAnalyzer.levelFeatureOverlapErrors));

    // Add tasks for tagAnalyzer errors.
    sitConf.tasks.push(createTask(UItext.SIT.tasks["BUILDINGTAGS-1"], tagAnalyzer.tagValueErrorsBuilding));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["BUILDINGTAGS-2"], tagAnalyzer.tagExistenceErrorsBuilding));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["BUILDINGTAGS-3"], tagAnalyzer.tagErrorMinMax));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["DOORTAGS-1"], tagAnalyzer.tagErrorsDoors));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["LEVELTAGS-1"], tagAnalyzer.levelTagValueErrors));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["LEVELTAGS-2"], tagAnalyzer.tagExistenceErrorsLevel));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["LEVELTAGS-3"], tagAnalyzer.levelAndRepeatErrors));
    sitConf.tasks.push(createTask(UItext.SIT.tasks["LEVELTAGS-4"], tagAnalyzer.nonExistingLevelErrors));

    achievements.push(sitConf);
    return tagAnalyzer;
}

// Creates all of the accessibility achievements and adds them to the achievement list of the current building.
function addAccessibilityAchievements(tagAnalyzer, achievements, UItext){
    // Execute analysis of the current building's tags.
    tagAnalyzer.checkTagsForAccessibility();

    //achievment door accessibility basic
    var accDoorBasic ={
        achievementId:  "BFD"
    }
    applyStaticAchievementProperties(UItext, accDoorBasic);
    accDoorBasic.fulfilled = false;
    accDoorBasic.currentStatus = tagAnalyzer.accDoorBasicPercentage*100;
    if(accDoorBasic.currentStatus===100){
        accDoorBasic.fulfilled = true;
    }
    accDoorBasic.tasks = [];
    accDoorBasic.tasks.push(createTask(UItext.BFD.tasks["ACCDOORBASIC-X"], tagAnalyzer.accDoorErrorBasic));
    achievements.push(accDoorBasic);
    
    //achievment stairs accessibility basic
    var accStairsBasic ={
        achievementId:  "BFS"
    }
    applyStaticAchievementProperties(UItext, accStairsBasic);
    accStairsBasic.fulfilled = false;
    accStairsBasic.currentStatus = tagAnalyzer.accStairsBasicPercentage * 100;
    if(accStairsBasic.currentStatus ===100){
        accStairsBasic.fulfilled=true;
    }
    accStairsBasic.tasks = [];
    accStairsBasic.tasks.push(createTask(UItext.BFS.tasks["ACCRAMPBASIC-X"], tagAnalyzer.accRampErrorBasic));
    accStairsBasic.tasks.push(createTask(UItext.BFS.tasks["ACCSTAIRSBASIC-X"], tagAnalyzer.accStairsErrorBasic));
    achievements.push(accStairsBasic);

    //achievment elevator accessibility basic
    var accElevBasic ={
        achievementId:  "ELEV"
    }
    applyStaticAchievementProperties(UItext, accElevBasic);
    accElevBasic.fulfilled = false;
    accElevBasic.currentStatus = tagAnalyzer.accElevBasicPercentage * 100;
    if(accElevBasic.currentStatus === 100){
        accElevBasic.fulfilled=true;
    }
    accElevBasic.tasks = [];
    accElevBasic.tasks.push(createTask(UItext.ELEV.tasks["ACCELEVBASIC-X"], tagAnalyzer.accElevErrorBasic));
    achievements.push(accElevBasic);
   
    //achievment WC accessibility
    var accWC ={
        achievementId:  "WC"
    }
    applyStaticAchievementProperties(UItext, accWC);
    accWC.fulfilled = false;
    accWC.currentStatus = tagAnalyzer.accWCPercentage*100;
    if(accWC.currentStatus ===100){
        accWC.fulfilled = true;
    }
    accWC.tasks = [];
    accWC.tasks.push(createTask(UItext.WC.tasks["ACCWC-X"], tagAnalyzer.accWC));
    achievements.push(accWC);

    //achievment tactile accessibility
    var accTAC ={
        achievementId:  "TAC"
    }
    applyStaticAchievementProperties(UItext, accTAC);
    accTAC.fulfilled = false;
    accTAC.currentStatus = tagAnalyzer.accTACPercentage*100;
    if(accTAC.currentStatus===100){
        accTAC.fulfilled=true;
    }
    accTAC.tasks = [];
    accTAC.tasks.push(createTask(UItext.TAC.tasks["ACCTAC-X"], tagAnalyzer.accTAC));
    achievements.push(accTAC);

    //achievement door accessibility premium
    var accDoorPrem ={
        achievementId:  "BFD2"
    }
    applyStaticAchievementProperties(UItext, accDoorPrem);
    accDoorPrem.fulfilled = false;
    accDoorPrem.currentStatus = tagAnalyzer.accDoorPremiumPercentage*100;
    if(accDoorPrem.currentStatus ===100){
        accDoorPrem.fulfilled=true;
    }
    accDoorPrem.tasks = [];
    accDoorPrem.tasks.push(createTask(UItext.BFD2.tasks["ACCDOORPREMIUM-X"], tagAnalyzer.accDoorErrorPremium));
    achievements.push(accDoorPrem);

    //achievement Stairs accessibility premium
    var accStairsPrem ={
        achievementId:  "BFS2"
    }
    applyStaticAchievementProperties(UItext, accStairsPrem);
    accStairsPrem.fulfilled = false;
    accStairsPrem.currentStatus = tagAnalyzer.accStairsPremiumPercentage*100;
    if(accStairsPrem.currentStatus === 100){
        accStairsPrem.fulfilled = true;
    }
    accStairsPrem.tasks = [];
    accStairsPrem.tasks.push(createTask(UItext.BFS2.tasks["ACCRAMPPREMIUM-X"], tagAnalyzer.accRampErrorPremium));
    accStairsPrem.tasks.push(createTask(UItext.BFS2.tasks["ACCSTAIRSPREMIUM-X"], tagAnalyzer.accStairsErrorPremium));
    achievements.push(accStairsPrem);

    //achievement Elevator accessibility premium
    var accElevPrem ={
        achievementId:  "ELEV2"
    }
    applyStaticAchievementProperties(UItext, accElevPrem);
    accElevPrem.fulfilled = false;
    accElevPrem.currentStatus = tagAnalyzer.accElevPremiumPercentage*100;

    if(accElevPrem.currentStatus===100){
        accElevPrem.fulfilled=true;
    }
    accElevPrem.tasks = [];
    accElevPrem.tasks.push(createTask(UItext.ELEV2.tasks["ACCELEVPREMIUM-X"], tagAnalyzer.accElevErrorPremium));
    achievements.push(accElevPrem);
}

// Creates all of the navigability achievements and adds them to the achievement list of the current building.
function addNavigabilityAchievements(buildingWithLevels, navigationControl, achievements, UItext){
    // Achievement: Entrance
    var entrance = {
        achievementId:  "ENTR"
    };
    applyStaticAchievementProperties(UItext, entrance);
    entrance.fulfilled = navigationControl.checkBuildingEntrance();
    entrance.tasks = [];
    var errors = [];
    if (entrance.fulfilled){
        entrance.currentStatus = 100;
    }
    // if no entrance exists, generate the according task and error
    else {
        entrance.currentStatus = 0;
        let error = makeErrorObj("ENTR-1", [buildingWithLevels.building.id], []);
        errors.push(error);
    }
    entrance.tasks.push(createTask(UItext.ENTR.tasks["ENTR-1"], errors));
    achievements.push(entrance);   

    // Achievement: Door
    // Doesn't check only SIT-conform rooms yet, but all indoor areas
    var door = {
        achievementId:  "DOOR"
    };
    applyStaticAchievementProperties(UItext, door);
    door.currentStatus = navigationControl.roomsWithDoorsPercent() * 100;
    door.tasks = [];
    errors = []

    if (door.currentStatus === 100){
        door.fulfilled = true;
    }
    // If not all rooms have a door, generate the according task and an error per room without a door
    else {
        door.fulfilled = false;
        let rooms = navigationControl.getRoomList();
        for (const r of rooms){
            if (!r.hasdoor){
                let error = makeErrorObj("DOOR-1", [ r.id ], []);
                errors.push(error);
            }
        }
        
    }
    door.tasks.push(createTask(UItext.DOOR.tasks["DOOR-1"], errors));
    achievements.push(door);

    // Achievement: Level reachability
    var levelReach = {
        achievementId:  "LVLREACH"
    };
    applyStaticAchievementProperties(UItext, levelReach);
    
    levelReach.currentStatus = navigationControl.reachableLevelsPercent() * 100;
    levelReach.tasks = [];
    errors = [];
    if (levelReach.currentStatus === 100){
        levelReach.fulfilled = true;
    }
    // If not all level are reachable, generate the according tasks and an error per not reachable level
    else {
        levelReach.fulfilled = false;
        for (const levelObj of buildingWithLevels.levels){
            if (!navigationControl.isReachableLevel(levelObj.level)){
                let error = makeErrorObj("LVLREACH-1", [ levelObj.level ], []); 
                errors.push(error);
            }
        }
    }
    levelReach.tasks.push(createTask(UItext.LVLREACH.tasks["LVLREACH-1"], errors));
    achievements.push(levelReach);

    // Achievement: Indoor Reachability
    var indoorReach = {
        achievementId:  "REACH"
    };
    applyStaticAchievementProperties(UItext, indoorReach);
    indoorReach.currentStatus = navigationControl.reachablePercent() * 100;
    indoorReach.tasks = [];
    errors = []
    if (indoorReach.currentStatus === 100){
        indoorReach.fulfilled = true;
    }
    // If not all indoor areas are reachbale, generate the according task and an error per not reachable area
    else {
        indoorReach.fulfilled = false;
        let rooms = navigationControl.getRoomList();
        for (const r of rooms){
            //in r.level is the level of the room saved. If !r.outsiderachable you could add level info.
            if (!r.outsidereachable){
                let error = makeErrorObj("REACH-1", [ r.id ], []);
                errors.push(error);
            }
        }
        
    }
    indoorReach.tasks.push(createTask(UItext.REACH.tasks["REACH-1"], errors));
    achievements.push(indoorReach);
}

// Adds the according properties (name, group, description, precondition) from the UItext object (from ./UItext.json) to an achievement object which has an achievement id
// achievement object as specified in the achievements list of a building in the buildings list in ../sampleData/sampleBuilding.json
function applyStaticAchievementProperties(staticAchievementProperties, achievementObj){
    var achievementId = null;
    if (achievementObj.hasOwnProperty("achievementId")){
        achievementId = achievementObj.achievementId;
        achievementObj.name = staticAchievementProperties[achievementId].name;
        achievementObj.group = staticAchievementProperties[achievementId].group;
        achievementObj.description = staticAchievementProperties[achievementId].description;
        achievementObj.precondition = staticAchievementProperties[achievementId].precondition;
    }
    else {
        throw Error("The achievement object should already have an achievementId property with a value!");
    }      
}

// Returns a task object for a given taskId from the staticTaskProperties (from the "tasks" property of an achievement from ./UItext) object
// Also creates a list of errors for the task object from the given array of error objects by using the error properties from the "errors" property of the staticTaskProperties object
// task object as specified in the achievements of a building in the buildings list in ../sampleData/sampleBuilding.json
function createTask(staticTaskProperties, errors){
    var task = {
        name:   staticTaskProperties.name,
        errors: []
    };
    for (const e of errors){
        task.errors.push(createErrorVisObj(staticTaskProperties.errors, e));
    }
    return task;
}

// Returns an error object for visualation from a given error object (with an id and references) and the errorProperties object (from the "errors" property of a task of an achievement from ./UItext.json)
// error object as specified in the tasks of achievements of a building in the buildings list in ../sampleData/sampleBuilding.json
function createErrorVisObj(errorProperties, error){

    // Use dynamic suggestions for specific error types.
    let suggestionString;
    if (["TYPE-1", "TYPE-2", "TYPE-3"].includes(error.id)){
        suggestionString = error.references.splice(0, 1);
    } else {
        suggestionString = errorProperties[error.id].suggestion;
    }

    return {
        id:             error.id,
        title:          fillErrorPropertyTemplate(errorProperties[error.id].title, error.references, error.multiReferences),
        type:           errorProperties[error.id].type,
        suggestion:     suggestionString,
        references:     error.references
    }
}

// Returns an instance of an error property template from the template string and the references of the according error
function fillErrorPropertyTemplate(template, references, multiReferences){
    // templates are seperated into parts to with a '|' symbol to enable counting of placeholders ('$') for references
    // throw exception, if the number of references doesn't match the number of placeholders
    var templateParts = template.split("|");
    var placeholderCount = 0;
    for (const part of templateParts){
        if (part.includes("$")){
            placeholderCount++;
        }
    }
    if (placeholderCount > references.length){
        throw Error("The error doesn't contain enough references to substitute all placeholders!");
    }

    // create the description instance: replace placeholders with references according to their order in the error references
    var errorPropertyInstance = "";
    for (let i = 0; i < templateParts.length; i++){
        // some reference items might be an array, e.g. a list of self intersections of a way
        if (multiReferences.includes(i)){
            var multiReferenceString = "";
            for (let j = 0; j < references[i].length; j++){
                if (j < references[i].length - 2){
                    multiReferenceString += "" + formatSingularReference(references[i][j]) + ", ";
                }
                else if (j === references[i].length - 2){
                    multiReferenceString += "" + formatSingularReference(references[i][j]) + " and ";
                }
                else {
                    multiReferenceString += "" + formatSingularReference(references[i][j]);
                }
            }
            templateParts[i] = templateParts[i].replace("$", multiReferenceString);
        } else {
            templateParts[i] = templateParts[i].replace("$", formatSingularReference(references[i]));
        }
        errorPropertyInstance += templateParts[i];
    }

    return errorPropertyInstance;
}

// Formats a singular reference, i.e. a direct non-array item of an error's references or an item of an error's references array items.
function formatSingularReference(reference){
    if (reference === undefined){
        throw Error("Reference is undefined!");
    }

    // Check if reference is no string or number (can be substituted into an error property template without further formatting)
    if (!(typeof reference === 'string' || reference instanceof String) && reference.hasOwnProperty("length")){
        // Check if reference is a list of point coordinates, not a coordinate pair of a single point.
        if (reference[0].hasOwnProperty("length")){
            var referenceString = "";
            for (let i = 0; i < reference.length; i++){
                if (i < reference.length - 2){
                    referenceString += "" + reference[i] + ", ";
                }
                else if (i === reference.length - 2){
                    referenceString += "" + reference[i] + " & ";
                }
                else {
                    referenceString += "" + reference[i];
                }
            }
            return referenceString;
        }
        // Format point coordinates
        else {
            return "(" + reference[0] + ", " + reference[1] + ")";
        }
    }
    else {
        return reference;
    }
}

export {analysisToVisObj,addCoverageInfo};