import { boolClosedWayIntersected } from './ctrl/intersections';
import { polygon } from '@turf/helpers';
import turfBooleanContains from "@turf/boolean-contains";

const achievements = require("./view/UItext.json");

// returns an error object {"id": ..., "references": [..., ..., ...], "multiReferences": [..., ..., ...]}
// amount of references is not limited
function makeErrorObj(id, references, multiReferences){
    
    // checks to prevent erroneous references
    for (let i = 0; i < references.length; i++){
        if (typeof references[i] === undefined){
            throw Error("A reference is undefined!");
        }
        if (multiReferences.includes(i)){
            for (const ref of multiReferences){
                if (typeof ref === undefined){
                    throw Error("A reference is undefined!");
                }
            }
        }
    }

    return {"id": id, "references": references, "multiReferences": multiReferences};
}

// Checks equality between the coordinates of two points.
// turf's booleanEqual doesn't actually check for identical coordinate values, but rounds
// to precise values at relevant precision.
function boolPointsEqual(coords1, coords2){
    if (coords1[0] === coords2[0] && coords1[1] === coords2[1]) {return true;}
    else {return false;}
}

// Parses a level range string of the format "(-)Int(-)-Int" (symbols in brackets are optional) and returns 
// the number range from the first integer value to the second one.
// Returns an empty array if the second integer value is smaller than the first one.
function parseLevelRangeString(levelRangeString){
    var i = 1;
    while (!(isNaN(parseInt(levelRangeString.charAt(i))))){
        i++;
    }
    var firstNumberEndIdx = i - 1;
    var secondNumberStartIdx = i + 1;
        
    var levelRange = [];
    var firstNumber = parseInt(levelRangeString.substring(0, firstNumberEndIdx + 1));
    var secondNumber = parseInt(levelRangeString.substring(secondNumberStartIdx, levelRangeString.length));

    if (secondNumber > firstNumber){
        for (let j = firstNumber; j <= secondNumber; j++){
            levelRange.push(j);
        }
    } 
    else {
        for (let j = secondNumber; j <= firstNumber; j++){
            levelRange.push(j);
        }
    }
    
    return levelRange;
}

// Parses a level string potentially containing multiple level ranges.
// Returns an array of levels.  
// Returns false, if the format of the given string doesn't match the following format: element; ...; element witch each element either being an integer or
// of the format "(-)Int(-)-Int"; symbols in brackets are optional
function getLevelsAsNumbersFromString(levelStr){
    if (/^-?\d+(?:--?\d+)?(?:;-?\d+(?:--?\d+)?)*$/.test(levelStr)){
        var levelStrParts = levelStr.split(";");
        var levels = [];
        for (var i = 0; i < levelStrParts.length; i++){
            // part is a level range
            if (/^-?\d+--?\d+$/.test(levelStrParts[i])){
                levels = levels.concat(parseLevelRangeString(levelStrParts[i]));
            }
            // part is just a number
            else{
                levels = levels.concat(parseInt(levelStrParts[i]));
            }
        }
        return levels.sort((a, b) => a - b);
    }
    else {
        return false;
    }
}


// Returns an array of level numbers given by the "level" or "repeat_on" tag of a feature. 
// If it has both tags, and both have valid values, the levels of the "level" tag is returned. If at least one value is valid, its levels are returned. 
// Otherwise, false is returned. 
// If the feature has neither the "level" or "repeat_on" tag, -1 is returned.
// If the optional parameter origin is given as true, an object will be returned instead. In its property 'levels', it returns the return values described above,
// and in it's property 'origin' the tag where the levels-value originates from.  
function getLevelsAsNumbers(feature, origin){
    var hasLevelTag = feature.properties.tags.hasOwnProperty("level");
    var hasRepeatOnTag = feature.properties.tags.hasOwnProperty("repeat_on");

    if (hasLevelTag){
        var levelLevels = getLevelsAsNumbersFromString(feature.properties.tags.level);
    }
    if (hasRepeatOnTag){
        var repeatOnLevels = getLevelsAsNumbersFromString(feature.properties.tags.repeat_on);
    }

    // If both a "level" and "repeat_on" tag exist, return the levels of the one with valid value. If both values are valid, return levels of the "level" tag.
    if (hasLevelTag && hasRepeatOnTag){
        if (levelLevels){ 
            if (origin === undefined || origin === false){
                return levelLevels;
            }
            else {
                return {
                    levels: levelLevels,
                    origin: "level" 
                } 
            }
        }
        else {
            if (origin === undefined || origin === false){
                return repeatOnLevels;
            }
            else {
                return {
                    levels: repeatOnLevels,
                    origin: "repeat_on"
                } 
            } 
        }
    }
    
    else if (hasLevelTag){
        if (origin === undefined || origin === false){
            return levelLevels;
        }
        return {
            levels: levelLevels,
            origin: "level" 
        } 
    }
    else if (hasRepeatOnTag){
        if (origin === undefined || origin === false){
            return repeatOnLevels;
        }
        else {
            return {
                levels: repeatOnLevels,
                origin: "repeat_on"
            } 
        } 
    }
    else {
        if (origin === undefined || origin === false){
            return -1;
        }
        else {
            return {
            levels: -1,
            origin: "none"
            };
        }    
    }
}

// Returns an array of level numbers given by the "level" or "repeat_on" tag of a feature, aggregated into groups of successive levels.
// If it has both tags, and both have valid values, the levels of the "level" tag are returned. If at least one value is valid, its levels are returned. 
// Otherwise, false is returned. 
// If the feature has neither the "level" or "repeat_on" tag, -1 is returned.  
function getLevelsAsMultilevelGroups(feature){
    var levels = getLevelsAsNumbers(feature, true);
    
    if (levels.levels === false || levels.levels === -1){
        return levels.levels;
    }
    
    var multiLevelGroups = [];
    var currentMultiLevelGroup = [];
    for (var i = 0; i < levels.levels.length; i++){
        // start of multi level group aggregation
        if (i === 0){
            currentMultiLevelGroup = [ levels.levels[i] ];
        }
        else {
            // Only the level tag is used to model multi-level features. 
            // If the level values originate from a 'repeat_on' tag, each level forms its own 'multi-level'.
            if (levels.origin === "level"){
                // successive levels form a multi level group
                if (levels.levels[i] === levels.levels[i - 1] + 1){
                    currentMultiLevelGroup.push(levels.levels[i]);
                }
                // levels that are no successor form a new multi level group,
                // repeated levels are ignored (getLevelsAsNumbers returns a sorted array)
                else if (levels.levels[i] !== levels.levels[i - 1]){
                    multiLevelGroups.push(currentMultiLevelGroup);
                    currentMultiLevelGroup = [ levels.levels[i] ];
                }

            }
            else {
                multiLevelGroups.push(currentMultiLevelGroup);
                currentMultiLevelGroup = [ levels.levels[i] ];
            }
        }
    }

    multiLevelGroups.push(currentMultiLevelGroup);
    return multiLevelGroups;
}

// Wrapper for turf's 'booleanContains' function to also enable checking of containment relationships
// between multi-polygon features.
function booleanContains(feature1, feature2){

    // If the contained feature is a multi-polygon, all it's (sub)polygons have to be contained by the containing feature. 
    if (feature2.geometry.type === "MultiPolygon"){

        // Return false if a (sub)polygon of feature2 is not contained.
        for (const containedPolygonCoords of feature2.geometry.coordinates){

            // If the containing feature is also a multi-polygon, a (sub)polygon of the second feature is contained if it's fully
            // contained by any of the containing feature's subpolygons.
            if (feature1.geometry.type === "MultiPolygon"){

                let containedByAnyContainingPolygon = false;
                for (const containingPolygonCoords of feature1.geometry.coordinates){
                    if (turfBooleanContains(polygon(containingPolygonCoords), polygon(containedPolygonCoords))){
                        containedByAnyContainingPolygon = true;
                        break;
                    }
                }
                if (!containedByAnyContainingPolygon){
                    return false;
                }

            }
    
            else {
                
                if (!turfBooleanContains(feature1, polygon(containedPolygonCoords))){
                    return false;
                }

            }

        }

        // Return true otherwise.
        return true;

    }

    else {

        // If only the containîng feature is a multi-polygon, one needs to check if 
        // feature2 is contained by any of feature1's (sub)polygons. 
        if (feature1.geometry.type === "MultiPolygon"){

            for (const containingPolygonCoords of feature1.geometry.coordinates){
                if (turfBooleanContains(polygon(containingPolygonCoords), feature2)){
                    return true;
                }
            }
            return false;

        }

        // If none of the features is a multi-polygon simply apply turf's 'booleanContains' function.
        else {

            return (turfBooleanContains(feature1, feature2));

        }

    }

}

// Returns true if the two given polygons overlap (intersections between their line strings || one containing the other),
// otherwise false.
function boolPolygonOverlap(polygon1Coords, polygon2Coords){
    var polygon1 = polygon(polygon1Coords);
    var polygon2 = polygon(polygon2Coords);
    return boolPolygonBordersIntersected(polygon1, polygon2) || booleanContains(polygon1, polygon2) || booleanContains(polygon2, polygon1);
}

// Takes a 'MultiPolygon' feature and an intersecting 'LineString', 'Polygon' or "MultiPolygon" feature.
// Returns true, if the line strings of the features intersect, false otherwise. 
function boolMultiPolygonBordersIntersected(multiPolygonFeature, intersectingFeature){
    
    // fault tolerance checks
    if (multiPolygonFeature.geometry.type !== "MultiPolygon"){
        throw Error ("multiPolygonFeature is no feature with a multi-polygon geometry.");
    }
    
    for (const polygonCoords of multiPolygonFeature.geometry.coordinates){
        if (boolPolygonBordersIntersected(polygon(polygonCoords), intersectingFeature)){
            return true;
        }
    }

    return false;
}

// Takes a 'Polygon' feature and an intersecting 'LineString', 'Polygon' or "MultiPolygon" feature.
// Returns true, if the line strings of the features intersect, false otherwise.
function boolPolygonBordersIntersected(polygonFeature, intersectingFeature){
    
    // fault tolerance checks
    if (polygonFeature.geometry.type !== "Polygon"){
        throw Error ("areaFeature is no feature with a polygon geometry.");
    }
    if (!["LineString", "Polygon", "MultiPolygon"].includes(intersectingFeature.geometry.type)){
        throw Error("intersectingFeature does not have a 'LineString', 'Polygon' or 'MultiPolygon' geometry.");
    }

    if (intersectingFeature.geometry.type === "LineString"){

        for (const subpolygonCoords of polygonFeature.geometry.coordinates){
            if (boolClosedWayIntersected(subpolygonCoords, intersectingFeature.geometry.coordinates)){
                return true;
            }
        }
        return false;
    }
    else if (intersectingFeature.geometry.type === "Polygon") {
        for (const subpolygonCoords of polygonFeature.geometry.coordinates){
            for (const intersectingSubpolygonCoords of intersectingFeature.geometry.coordinates){
                if (boolClosedWayIntersected(subpolygonCoords, intersectingSubpolygonCoords)){
                    return true;
                }
            }
        }
        return false;
    }
    // Because of fault tolerance checks:
    // intersectingFeature.geometry.type === "MultiPolygon" = true
    else {
        for (const subpolygonCoords of polygonFeature.geometry.coordinates){
            for (const intersectingPolygonCoords of intersectingFeature.geometry.coordinates){
                for (const intersectingSubpolygonCoords of intersectingPolygonCoords){
                    if (boolClosedWayIntersected(subpolygonCoords, intersectingSubpolygonCoords)){
                        return true;
                    }
                }
            }
        }
        return false;
    }
}

// Returns true, if the levels given by the 'level' or 'repeat_on' tag of the feature1 and feature2 have a common level.
// Returns false, if at least one of the features does not have a valid 'level' or 'repeat_on' tag, or if there is no common level. 
function booleanLevelsOverlap(feature1, feature2){
    var f1Levels = getLevelsAsNumbers(feature1);
    var f2Levels = getLevelsAsNumbers(feature2);
    
    if (f1Levels === false || f1Levels === -1 || f2Levels === false || f2Levels === -1){
        return false;
    }
    
    for (const f1L of f1Levels){
        if (f2Levels.includes(f1L)){
            return true;
        }
    }

    return false;
}

// Returns true, if the supposedly wider range of level values has a value that's not also a value of the supposedly smaller level range.
// Returns false, if at least one of the level ranges is not valid, or if there's no such value.
function boolLevelRangeHasNonCommonValues(smallerLevelRange, widerLevelRange){
    var f1Levels = smallerLevelRange;
    var f2Levels = widerLevelRange;

    if (f1Levels === false || f1Levels === -1 || f2Levels === false || f2Levels === -1){
        return false;
    }

    for (const f2L of f2Levels){
        if (!f1Levels.includes(f2L)){
            return true;
        }
    }

    return false;
}

// Returns true, if all values of the 'levels' array are contained by the 'comparisonLevels' array.
// Returns false otherwise.
function booleanAllLevelsIncluded(levels, comparisonLevels){
    for (const levelsL of levels){
        if (!comparisonLevels.includes(levelsL)){
            return false;
        }
    }
    return true;
}

// Returns true, if the geometry of 'feature1' is contained by the geometry of 'feature2' and all levels, 
// given by the 'level' or 'repeat_on' tags of the features, of 'feature1' are also levels of 'feature2'.
// Returns false otherwise.
// Only use for polygon features! The used function 'booleanContains' has some issues with containment of 
// line strings and points.
function booleanVerticallyAndHorizontallyContains(feature1, feature2){
    if (booleanContains(feature1, feature2)){
        var f1Levels = getLevelsAsNumbers(feature1);
        var f2Levels = getLevelsAsNumbers(feature2);

        if (f1Levels !== false && f1Levels !== -1 && f2Levels !== false && f2Levels !== -1){
            return booleanAllLevelsIncluded(f2Levels, f1Levels);
        }
        else {
            return false;
        }
    }
    else {
        return false;
    }
}

// Returns all 'multi-levels', i.e. arrays of successive level values, of the array 'comparisonMultiLevels',
// which contain at least one value of the 'multiLevel' array (of level values). 
function getContainingMultiLevels(multiLevel, comparisonMultiLevels){
    let containingMultiLevels = [];
    for (let i = 0; i < comparisonMultiLevels.length; i++){
        for (const multiLevelLevel of multiLevel){
            if (comparisonMultiLevels[i].includes(multiLevelLevel)){
                containingMultiLevels.push(comparisonMultiLevels[i]);
                break;
            }
        }
    }
    return containingMultiLevels;
}

// Returns the name of an achievement.
function getAchievementNameById(achievementId) {
    return achievements[achievementId].name;
}

export {makeErrorObj, boolPointsEqual, getLevelsAsNumbers, getLevelsAsNumbersFromString, getLevelsAsMultilevelGroups, boolPolygonOverlap, booleanLevelsOverlap, boolLevelRangeHasNonCommonValues, boolPolygonBordersIntersected, boolMultiPolygonBordersIntersected, getAchievementNameById, booleanVerticallyAndHorizontallyContains, getContainingMultiLevels, booleanAllLevelsIncluded, booleanContains};
