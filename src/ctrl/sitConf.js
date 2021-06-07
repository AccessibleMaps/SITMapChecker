import {boolClosedWayIntersected, waySelfIntersections} from "./intersections";
import {makeErrorObj, getLevelsAsNumbers, getLevelsAsMultilevelGroups, boolPolygonOverlap, booleanLevelsOverlap, boolLevelRangeHasNonCommonValues, boolPolygonBordersIntersected, booleanVerticallyAndHorizontallyContains, getContainingMultiLevels, booleanAllLevelsIncluded, booleanContains} from "../utils_own";
import booleanPointOnLine from "@turf/boolean-point-on-line";
import * as turfHelpers from "@turf/helpers";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
class SITAnalyzer extends Object{
    constructor(){
        super();

        /* containers of errors of the currently analyzed map view */

        // geometrical errors //
        // errors of self-intersection of features, no relevance for analysis of other buildings
        this.intersectErrors = [];
        // errors of intersections of a building's borders by its features, no relevance for analysis of other buildings
        this.buildingBordersIntersectErrors = [];
        // errors of overlaps between buildings; relevant for analysis of other buildings
        this.buildingOverlapErrors = {};
        // errors of overlaps between level features, no relevance for analysis of other buildings
        this.levelFeatureOverlapErrors = [];
        // intermediate error objects for geometry type SIT type inconsistency errors of features of a building, which will receive dynamic suggestions
        // no relevance for analysis of other buildings
        this.preliminaryGeometrySITTypeInconsistencyErrors = [];
        // errors for geometry type SIT type inconsistency of features of a building
        // no relevance for analysis of other buildings
        this.geometrySITTypeInconsistencyErrors = [];
        // errors of polygon geometries of features, no relevance for analysis of other buildings
        this.polygonErrors = [];
        // errors of multi-polygon geometries of features, no relevance for analysis of other buildings
        this.multipolygonErrors = [];

        // errors related to doors //
        // errors for single-level door features
        this.doorNoWallErrors = [];
        // errors for multi-level door features
        this.doorMultiLevelErrors = [];
        
        /* additional variables */
        // container of different kinds of features with consistent geometry and SIT types
        // not relevant for analysis of other buildings
        this.correctSITTypeObjects = {};
        // set of features with nonconsistent geometry and SIT types
        // not relevant for analysis of other buildings
        this.incorrectSITTypeObjects = [];
        // checkGeometry() needs to be executed for all features with another geometry than 'Point' before analyzing if doors are situated on walls.
        // One can set this boolean to true if this is done. If its value is false, the function for analyzing
        // if doors are situated on walls will throw an exception.
        // not relevant for analysis of other buildings
        this.nonDoorTypesAnalyzed = false;
        // faultyRoomRoomOverlaps(), faultyCorridorRoomOverlaps() and faultyCorridorCorridorOverlaps() need to be executed
        // before analyzing the validity of overlaps between area features and room or corridor features. One can set this
        // boolean to true if this is done. 
        // If its value is false, the functions for analyzing overlaps with area features will throw an exception.
        // not relevant for analysis of other buildings 
        this.corridorAndRoomOverlapsAnalyzed = false;

        // containers of validly contained / containing / intersecting rooms and corridors, grouped by feature
        // not relevant for analysis of other buildings
        this.validlyContainingRoomsAndCorridors = [];
        this.validlyContainedRoomsAndCorridors = [];
        this.validlyIntersectingRoomsAndCorridors = [];

        // Variable for storing the percentage of SIT conformity for all buildings
        // not relevant for analysis of other buildings
        this.sitConfStatus = null;
        // set of features which have any SIT conformity error, used for calculating sitConfStatus
        // Might contain the building feature.
        // not relevant for analysis of other buildings
        this.nonConformObjects = new Set();
    }

    // Performs complete SIT analysis of a building and its features.
    // Creates according error objects and stores them in the SITAnalyzer's error lists.
    analyzeBuilding(building){
        
        // Initialize variables for analysis of this building.
        this.buildingVariablesInitialization();
        if (this.buildingOverlapErrors[building.id] === undefined){
            this.buildingOverlapErrors[building.id] = [];
        }
        // building outline errors
        this.checkGeometry(building);
        // check for overlaps with other cached building features
        this.checkBuildingOverlap(building, window.vectorDataManager.getOSMBuildings().features);

        var allFeatures = window.vectorDataManager.getAllFeaturesInBuilding(building).features;
        var taggedAsDoor = [];
        
        for (const f of allFeatures){

            // Check all features for matching geometry type
            this.doesGeometryMatchSITType(f, building);
            
            // Check all features for valid geometry (points can't be erroneous in that aspect)
            if (f.geometry.type !== "Point"){
                this.checkGeometry(f, building);
            }

            if (f.geometry.type === "Point" && f.properties.tags.door){
                taggedAsDoor.push(f);
            }
        }

        // TODO if the work on the tool is continued after the practical course: Analysis of overlaps of features of a building.
        // Only execute analysis of faulty overlaps of indoor:area features if faulty overlaps 
        // of rooms and corridors have been checked and lists of validly overlapping features per feature
        // were generated!
        this.corridorAndRoomOverlapsAnalyzed = true;

        // Only excecute the following functions when object types were checked for type consistency!
        this.nonDoorTypesAnalyzed = true;
        
        // Check for overlaps of level features on the same level.
        this.checkLevelFeatureOverlaps();

        // Check if the features intersect the building's borders.
        for (const f of allFeatures){

            if (["Polygon", "LineString"].includes(f.geometry.type)){
                this.checkIntersectionOfBuildingBorders(f, building);   
            }
        }

        this.addSuggestionsToTypeInconsistencyErrors(building);

        // Check if doors consistently tagged doors are on walls.
        for (const d of taggedAsDoor){
            this.doorFeatureIsOnWallRepresentation(building, d, true);
        }
    }

    // (Re-)initializes variables regarding the analysis of one building.
    // For information on the variables, see comments in the constructor. 
    buildingVariablesInitialization(){
        this.intersectErrors = [];
        this.buildingBordersIntersectErrors = [];
        this.levelFeatureOverlapErrors = [];
        this.preliminaryGeometrySITTypeInconsistencyErrors = {};
        this.geometrySITTypeInconsistencyErrors = [];
        this.polygonErrors = [];
        this.multipolygonErrors = [];
        this.doorNoWallErrors = [];
        this.doorMultiLevelErrors = [];
        this.correctSITTypeObjects = {
            "doors":        [],
            "levels":       [],
            "areas":        [],
            "corridors":    [],
            "walls":        [],
            "rooms":        []
        };
        this.incorrectSITTypeObjects =  new Set();
        this.nonDoorTypesAnalyzed = false;
        this.corridorAndRoomOverlapsAnalyzed = false;
        this.validlyContainingRoomsAndCorridors = {};
        this.validlyContainedRoomsAndCorridors = {};
        this.validlyIntersectingRoomsAndCorridors = {};
        this.nonConformObjects = new Set();
        this.tagValueErrorsBuilding = [];
        this.tagExistenceErrorsBuilding = [];
        this.tagErrorsDoors = [];
        this.levelTagValueErrors = [];
        this.levelAndRepeatErrors = [];
        this.nonExistingLevelErrors = [];
        this.tagExistenceErrorsLevel = [];
        this.tagErrorMinMax = [];
        this.sitConfStatus = null;
    }

    // Calculates status of fullfillment of the SIT conformity achievement according to total feature and non conform feature counts,
    // and saves it as a property in this object.
    finishBuildingAnalysis(building){
        var allFeaturesCount = window.vectorDataManager.getAllFeaturesInBuilding(building).features.length + 1
        this.sitConfStatus = (allFeaturesCount - this.nonConformObjects.size) / (allFeaturesCount) * 100;
    }

    // Checks a given feature's geometry (type: LineString, Polygon or MultiPolygon) for necessary overlap, inclusion and intersection properties
    // and creates according errors in the SITAnalyzer's error lists.
    checkGeometry(feature){
        var geometry = feature.geometry;

        // LineString: geometry only consists of one array of coordinates
        // Only can be geometrically erroneous via self intersections.
        if (geometry.type === "LineString"){
            this.checkSelfIntersections(feature, geometry.coordinates);
        }

        // Polygon: geometry consists of multiple arrays of coordinates, 
        // where the first represents the outer closed way, the rest the inner ones
        // The outer 'subpolygon' should contain all inner ones and they should not overlap.
        // The function checks these conditions and creates the according error.
        else if (geometry.type === "Polygon"){
            this.checkSubPolygonIntersections(feature, false);
        }

        // Multipolygon: geometry consists of an array of polygon coordinate arrays as described in
        // the comment directly above.
        // In addition to the conditions for each polygon listed there, the outer closed way of one of the
        // multipolygon's polygons should contain all other outer closed ways of the multipolygon's polygons.
        // Also, the multipolygon's polygons should not overlap. 
        else if (geometry.type === "MultiPolygon"){
            
            // Only buildings, not features, should be multipolygons. 
            // Create the according error if the multipolygon feature is not a building.
            if (!feature.properties.tags.building){
                this.multipolygonErrors.push(makeErrorObj("MULTIPOLY-3", [feature.id], []));
                this.nonConformObjects.add(feature.id);
                return; 
            }

            // will contain one array per polygon, containing the indices of the polygons of which the outer closed
            // ways are contained by the first polygon.
            var containedOuterByOuter = [];
            for(let i; i < geometry.coordinates.length; i++){
                containedOuterByOuter.push([]);
            }
            var overlappingPolygonPairs = [];

            // Iterating over all polygons.
            for (let i = 0; i < geometry.coordinates.length; i++){
                var polygon1 = turfHelpers.polygon(geometry.coordinates[i]);
                
                // Check singular polygon conditions and create according errors.
                this.checkSubPolygonIntersections(polygon1, true);

                // Iterating over all other polygons not compared to the first one yet.
                for (let j = i + 1; j < geometry.coordinates.length; j++){
                    
                    // Symmetrically check if the polygons contain each other.
                    if (booleanContains( turfHelpers.polygon( [geometry.coordinates[i][0] ] ) , turfHelpers.polygon( [geometry.coordinates[j][0] ] ) )){
                        containedOuterByOuter[i].push(j);
                    }
                    if (booleanContains( turfHelpers.polygon( [geometry.coordinates[j][0] ] ) , turfHelpers.polygon( [geometry.coordinates[i][0] ] ) )){
                        containedOuterByOuter[j].push(i);
                    }

                    // Check if the polygons do overlap. 
                    if (boolPolygonOverlap(geometry.coordinates[i], geometry.coordinates[j])){
                        overlappingPolygonPairs.push([i, j]);
                    }
                }
            }

            // Finish containing condition check.
            var oneOuterContainsAll = false; 
            for (const outerPolygonContained of containedOuterByOuter){
                if (outerPolygonContained.length === geometry.coordinates.length - 1){
                    oneOuterContainsAll = true;    
                }
            }

            // Create error for containing condition.
            if (!oneOuterContainsAll){
                this.multipolygonErrors.push(makeErrorObj("MULTIPOLY-1", [feature.id], []));
                this.nonConformObjects.add(feature.id);
            }

            // Create error for overlap condition.
            if (overlappingPolygonPairs.length > 0){
                this.multipolygonErrors.push(makeErrorObj("MULTIPOLY-2", [feature.id, overlappingPolygonPairs], []));
                this.nonConformObjects.add(feature.id);
            }
        }
    }


    // Checks and creates error objects for self intersections of a feature (out)line.
    // The error references depend on if the feature is a building or not and its geometry type.
    checkSelfIntersections(feature, coords){
        if (!(coords.length > 1 && coords[0].length === 2 && typeof coords[0][0] === "number")){
            throw Error("Wrong input, must be array of coordinate pairs.");
        }

        if (feature.properties.tags){
            if (feature.properties.tags.building){
                var featureTypeReference = "building";
                var partOfFeatureReference = "";
                var isBuilding = true;
            }
        }
        
        if (isBuilding === undefined) {
            switch (feature.geometry.type){
                case "LineString":
                    featureTypeReference = "line string";
                    partOfFeatureReference = "";
                    break;
                case "Polygon":
                    featureTypeReference = "polygon";
                    partOfFeatureReference = " in at least one of its closed ways"
                    break;
                case "MultiPolygon":
                    featureTypeReference = "multipolygon";
                    partOfFeatureReference = " in at least one of the closed ways of its subpolygons";
                    break;
                default:
                    throw Error("Wrong input feature: Must be LineString, Polygon or MultiPolygon geometry.");
            }
        }

        var selfIntersections = waySelfIntersections(coords);
            
        // True self intersections
        if (selfIntersections[0].length > 0){
            this.intersectErrors.push(makeErrorObj("INTERSECT-1", [featureTypeReference, feature.id, partOfFeatureReference, selfIntersections[0]], [3]));
            this.nonConformObjects.add(feature.id);
        }

        // Successive double nodes
        if (selfIntersections[1].length > 0){
            this.intersectErrors.push(makeErrorObj("INTERSECT-2", [featureTypeReference, feature.id, partOfFeatureReference, selfIntersections[1]], [3]));
            this.nonConformObjects.add(feature.id);
        }

        // Superposed line segments
        if (selfIntersections[2].length > 0){
            this.intersectErrors.push(makeErrorObj("INTERSECT-3", [featureTypeReference, feature.id, partOfFeatureReference, selfIntersections[2]], [3]));
            this.nonConformObjects.add(feature.id);
        }
    }

    // Checks the validity of polygon feature's geometry. The outer closed way should contain all inner ones 
    // and subpolyons should not overlap. Creates the according errors in the SITAnalyzer's error lists.
    // polyOfMultiPolyIdx is used to change the errors title according to the feature's geometry type and 
    // reference the faulty polygon of a multipolygon in the generated errors.
    checkSubPolygonIntersections(feature, polyOfMultiPolyIdx){

        // Set partOfFeatureReference to indicate intersections between sub polygons of a polygon of multipolygon
        // or subpolygons of a polygon in error visualization. 
        if (polyOfMultiPolyIdx !== undefined){
            var partOfFeatureReference = " in at least one of its polygons";
        } else {
            partOfFeatureReference = "";
        }

        // list of overlapping subpolygon pairs to be put as an error reference
        var overlappingSubpolygonPairs = [];
        var notFullyContainedInnerPolygons = [];
        for (let i = 0; i < feature.geometry.coordinates.length; i++){

            // Check self intersections for each subpolygon
            this.checkSelfIntersections(feature, feature.geometry.coordinates[i]);
            
            for (let j = i + 1; j < feature.geometry.coordinates.length; j++){

                // Check if outer polygon fully contains inner polygons.
                if (i === 0){
                    if (  !booleanContains(turfHelpers.polygon([feature.geometry.coordinates[0]]), turfHelpers.polygon([feature.geometry.coordinates[j]]))
                        || boolClosedWayIntersected(feature.geometry.coordinates[0], feature.geometry.coordinates[j]) ){
                        notFullyContainedInnerPolygons.push(j);
                    }
                }

                // Check if any subpolygons overlap.
                if (boolClosedWayIntersected(feature.geometry.coordinates[i], feature.geometry.coordinates[j])){
                    overlappingSubpolygonPairs.push([i, j]);
                }
            }
        }
        // Create error for overlapping subpolygons, providing a list of overlapping subpolygon pairs and the index of
        // the polygon in which this occurs (only needed for highlighting in visualization). 
        if (overlappingSubpolygonPairs.length > 0){
            this.polygonErrors.push(makeErrorObj("POLY-1", [ feature.id, partOfFeatureReference, overlappingSubpolygonPairs, polyOfMultiPolyIdx ], []));
            this.nonConformObjects.add(feature.id);
        }
        
        // Create error for inner subpolygons not fully contained by the outer one, providing a list of not fully contained inner polygons 
        // and the index of the polygon in which this occurs (only needed for highlighting in visualization). 
        if (notFullyContainedInnerPolygons.length > 0){
            this.polygonErrors.push(makeErrorObj("POLY-2", [ feature.id, partOfFeatureReference, notFullyContainedInnerPolygons, polyOfMultiPolyIdx ], []));
            this.nonConformObjects.add(feature.id);
        }
    }

    // Checks if the given 'feature' intersects the borders of the given 'building' on any level.
    // Analyzes intersection of borders of level features instead of the building object if any exist for each level of the 'feature'.
    // Creates to types of errors:
    // BUILDING-INTERSECT-1: When 'feature' intersects the building's borders without having a valid 'level' or 'repeat_on' tag.
    // BUILDING-INTERSECT-2: When 'feature' intersects the building's borders while having a valid 'level' or 'repeat_on' tag. In that case, arrays of the 
    // levels of the feature on which intersections occur and the level features which are intersected on these levels are part of the error.
    checkIntersectionOfBuildingBorders(feature, building){

        // checks for faulty inputs
        if (!["Polygon", "MultiPolygon"].includes(building.geometry.type)){
            throw Error("The parameter 'building' has no geometry of the type 'Polygon' or 'MultiPolygon'");
        }
        if (!building.properties.tags.building){
            throw Error("The parameter 'building' has no 'building' tag.");
        }
        if (!["Polygon", "LineString"].includes(feature.geometry.type)){
            throw Error("The parameter 'feature' has no geometry of 'Polygon' or 'LineString'! (Points can't be intersecting, Multi-polygons should not be used for indoor features.)");
        }
        if (!this.nonDoorTypesAnalyzed){
            throw Error("Geometry consistency with SIT tags must be already checked.");
        }

        var featureLevels = getLevelsAsNumbers(feature);

        // If the feature has no valid 'level' or 'repeat_on' tag:
        // Only check intersections with borders of the building object, the building's maximum extent.
        if (featureLevels === false || featureLevels === -1){

            let isIntersected = false;

            if (building.geometry.type === "Polygon"){
                
                // building: Polygon; feature: LineString => The line string could intersect all of the polygon's subpolygons.
                if (feature.geometry.type === "LineString"){
                    for (const subPolygonCoords of building.geometry.coordinates){
                        if (boolClosedWayIntersected(subPolygonCoords, feature.geometry.coordinates)){
                            isIntersected = true;
                            break;
                        }
                    }
                }

                // building: Polygon; feature: Polygon => Any subpolygon of the feature could intersect any subpolygon of the building.
                else if (feature.geometry.type === "Polygon"){
                    for (const featureSubPolygonCoords of feature.geometry.coordinates){
                        for (const buildingSubPolygonCoords of building.geometry.coordinates){
                            if (boolClosedWayIntersected(buildingSubPolygonCoords, featureSubPolygonCoords)){
                                isIntersected = true;
                                break;
                            }
                        }
                        if (isIntersected){
                            break;
                        }
                    }
                }
            }

            // Possible intersections: Intersections of the case of the building being a polygon geometry for all polygons of the multi-polygon.
            else if (building.geometry.type === "MultiPolygon"){

                for (const polygonCoords of building.geometry.coordinates){

                    if (feature.geometry.type === "LineString"){
                        for (const subPolygonCoords of polygonCoords){
                            if (boolClosedWayIntersected(subPolygonCoords, feature.geometry.coordinates)){
                                isIntersected = true;
                                break;
                            }
                        }
                    }
                    else if (feature.geometry.type === "Polygon"){
                        for (const featureSubPolygonCoords of feature.geometry.coordinates){
                            for (const buildingSubPolygonCoords of polygonCoords){
                                if (boolClosedWayIntersected(buildingSubPolygonCoords, featureSubPolygonCoords)){
                                    isIntersected = true;
                                    break;
                                }
                            }
                            if (isIntersected){
                                break;
                            }
                        }
                    }

                    if (isIntersected){
                        break;
                    }
                }
            }

            // Create an error which provides the information:
            // The feature intersects the building object's borders.
            if (isIntersected){
                this.buildingBordersIntersectErrors.push(makeErrorObj("BUILDING-INTERSECT-1", [feature.id], []));
                this.nonConformObjects.add(feature.id);
            }

        }

        // If the feature has a valid 'level' or 'repeat_on' tag:
        // Check for all levels of the feature: If level features exist on that level, if the feature intersects their borders. If none exist, check if 
        // the feature intersects the building object's borders.
        else {
            
            // sets to aggregate information which will be part of the potential error object //
            // levels on which the analyzed feature intersects a level feature or the building's borders if no level feature exists for that level
            var intersectedLevels = new Set();
            // level features of which the borders are intersected by the analyzed feature on levels which are levels of both the level feature and the analyzed feature
            var intersectedLevelFeatures = new Set();
            
            for (const featureLevel of featureLevels){

                var levelOutlineExists = false;

                for (const levelObj of this.correctSITTypeObjects.levels){
                    
                    var levelLevels = getLevelsAsNumbers(levelObj);
                    
                    // Skip the level feature if it does not have a valid 'repeat_on' or 'level' tag.
                    if (levelLevels !== false && levelLevels !== -1){

                        // Only check for intersection of the level feature's borders if it's on the current level of the analyzed feature (const featureLevel).
                        // Possible intersections: Same as the intersections of a polygon building (indoor features should not be multi-polygons) when the analyzed feature
                        // does not have a valid 'repeat_on' or 'level' tag.
                        if (levelLevels.includes(featureLevel)){
                            levelOutlineExists = true;

                            if (feature.geometry.type === "LineString"){
                                for (const subPolygonCoords of levelObj.geometry.coordinates){
                                    if (boolClosedWayIntersected(subPolygonCoords, feature.geometry.coordinates)){
                                        intersectedLevelFeatures.add("'" + levelObj.id + "'");
                                        intersectedLevels.add(featureLevel);
                                        break;                    
                                    }
                                }
                            }
                            else if (feature.geometry.type === "Polygon"){
                                for (const featureSubPolygonCoords of feature.geometry.coordinates){
                                    let isIntersected = false;
                                    for (const levelSubPolygonCoords of levelObj.geometry.coordinates){
                                        if (boolClosedWayIntersected(levelSubPolygonCoords, featureSubPolygonCoords)){
                                            intersectedLevelFeatures.add("'" + levelObj.id + "'");
                                            intersectedLevels.add(featureLevel); 
                                            isIntersected = true;
                                        }
                                    }
                                    if (isIntersected){
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                // Only check for intersection of the building object's borders if there is no level feature for the current level of the analyzed feature.
                // Possible intersections: Same as the intersections of a polygon building (indoor features should not be multi-polygons) when the analyzed feature
                // does not have a valid 'repeat_on' or 'level' tag.
                if (!levelOutlineExists){
                    if (building.geometry.type === "Polygon"){
                
                        if (feature.geometry.type === "LineString"){
                            for (const subPolygonCoords of building.geometry.coordinates){
                                if (boolClosedWayIntersected(subPolygonCoords, feature.geometry.coordinates)){
                                    intersectedLevels.add(featureLevel);
                                }
                            }
                        }
                        else if (feature.geometry.type === "Polygon"){
                            let isIntersected = false;
                            for (const featureSubPolygonCoords of feature.geometry.coordinates){
                                for (const buildingSubPolygonCoords of building.geometry.coordinates){
                                    if (boolClosedWayIntersected(buildingSubPolygonCoords, featureSubPolygonCoords)){
                                        intersectedLevels.add(featureLevel);
                                        isIntersected = true;
                                    }
                                }
                                if (isIntersected){
                                    break;
                                }
                            }
                        }
                    }
        
                    else if (building.geometry.type === "MultiPolygon"){

                        let isIntersected = false;

                        for (const polygonCoords of building.geometry.coordinates){
        
                            if (feature.geometry.type === "LineString"){
                                for (const subPolygonCoords of polygonCoords){
                                    if (boolClosedWayIntersected(subPolygonCoords, feature.geometry.coordinates)){
                                        intersectedLevels.add(featureLevel);
                                        isIntersected = true;
                                    }
                                }
                            }
                            else if (feature.geometry.type === "Polygon"){
                                for (const featureSubPolygonCoords of feature.geometry.coordinates){
                                    for (const buildingSubPolygonCoords of polygonCoords){
                                        if (boolClosedWayIntersected(buildingSubPolygonCoords, featureSubPolygonCoords)){
                                            intersectedLevels.add(featureLevel);
                                            isIntersected = true;
                                        }
                                    }

                                    if (isIntersected){
                                        break;
                                    }
                                }
                            }

                            if (isIntersected){
                                break;
                            }
                        }
                    }
                }
            }

            // Create an error which provides the information:
            // The feature intersects the building's borders on the given 'intersectedLevels' while intersecting the given 'intersectedLevelFeatures'.
            if (intersectedLevels.size > 0){
                this.buildingBordersIntersectErrors.push(makeErrorObj("BUILDING-INTERSECT-2", [feature.id, Array.from(intersectedLevels), Array.from(intersectedLevelFeatures)], [1, 2]));
                this.nonConformObjects.add(feature.id);
            }
        }
    }

    // Checks if a given building overlaps with other buildings and creates the according errors in the SITAnalyzer's error lists. 
    checkBuildingOverlap(building, allBuildings){
       
        for (const comparisonBuilding of allBuildings){
            // Prevent comparison with self.
            if (building.id !== comparisonBuilding.id){

                if (this.buildingOverlapErrors[comparisonBuilding.id] === undefined){
                    this.buildingOverlapErrors[comparisonBuilding.id] = [];
                }

                // Check if the overlap of the buildings has already been noticed from the perspective of the comparison building.
                let overlapAlreadyNoticed = false;
                if (this.buildingOverlapErrors.hasOwnProperty(comparisonBuilding.id)){
                    for (const overlapError of this.buildingOverlapErrors[comparisonBuilding.id]){
                        if (overlapError.references[3] === building.id){
                            overlapAlreadyNoticed = true;
                            break;
                        }
                    }
                }

                if (!overlapAlreadyNoticed){

                    if (building.geometry.type === "Polygon"){

                        // Check if the polygons do overlap & create according error if so.
                        if (comparisonBuilding.geometry.type === "Polygon"){
                        
                            // Check for intersections
                            if (boolPolygonOverlap(building.geometry.coordinates, comparisonBuilding.geometry.coordinates)){
                                this.buildingOverlapErrors[building.id].push(makeErrorObj("BUILDING-OVERLAP-1", [comparisonBuilding.id], []));
                                this.buildingOverlapErrors[comparisonBuilding.id].push(makeErrorObj("BUILDING-OVERLAP-1", [building.id], []));
                                this.nonConformObjects.add(building.id);
                            }
                        }

                        // Check if the polygon of the building is overlapped by any polygon of the multipolygon & create according error if so.
                        if (comparisonBuilding.geometry.type === "MultiPolygon"){

                            // will contain indices of polygons of the multipolygon that overlap the building polygon
                            var overlappingPolygons = [];

                            // Iterating over all polygons of the multipolygon
                            for (let i = 0; i < comparisonBuilding.geometry.coordinates.length; i++){
                                // Also check for containing and add to list of overlapping polygons of the multipolygon.
                                if (boolPolygonOverlap(building.geometry.coordinates, comparisonBuilding.geometry.coordinates[i])){
                                    overlappingPolygons.push(i);
                                }
                            }

                            // Create an error if overlapping polygons do exist, providing feature type and id of both allBuildings.
                            // Also create an error object for this situation from the perspective of the comparison building.
                            if (overlappingPolygons.length > 0){
                                this.buildingOverlapErrors[building.id].push(makeErrorObj("BUILDING-OVERLAP-1", [comparisonBuilding.id], []));
                                this.buildingOverlapErrors[comparisonBuilding.id].push(makeErrorObj("BUILDING-OVERLAP-1", [building.id], []));
                                this.nonConformObjects.add(building.id);
                            }
                        }
                    }

                    if (building.geometry.type === "MultiPolygon"){

                        // Check if any of the polygons of the building overlaps with the polygon of the comparison building.
                        if (comparisonBuilding.geometry.type === "Polygon"){
                        
                            var overlappedPolygons = [];
                            // Iterate over all polygons of the building multipolygon.
                            for (let i = 0; i < building.geometry.coordinates.length; i++){
                                if (boolPolygonOverlap(building.geometry.coordinates[i], comparisonBuilding.geometry.coordinates)){
                                    overlappedPolygons.push(i);
                                }
                            }
                            // Create an error if overlapped polygons do exist, providing feature type and id of both allBuildings.
                            // Also create an error object for this situation from the perspective of the comparison building.
                            if (overlappedPolygons.length > 0){
                                this.buildingOverlapErrors[building.id].push(makeErrorObj("BUILDING-OVERLAP-1", [comparisonBuilding.id], []));
                                this.buildingOverlapErrors[comparisonBuilding.id].push(makeErrorObj("BUILDING-OVERLAP-1", [building.id], []));
                                this.nonConformObjects.add(building.id);
                            }
                        }

                        // Check if any of the polygons of the building overlaps with any of the polygons of the comparison building.
                        if (comparisonBuilding.geometry.type === "MultiPolygon"){

                            var overlappingPolygonsPerPolygon = [];
                            var overlapExists = false;
                        
                            // Iterate over all polygons of the building multipolygon.
                            for (let i = 0; i < building.geometry.coordinates.length; i++){   
                                overlappingPolygons = [];

                                // Iterate over all polygons of the comparisonBuilding multipolygon
                                for (let j = 0; j < comparisonBuilding.geometry.coordinates.length; j++){
                                    if (boolPolygonOverlap(building.geometry.coordinates[i], comparisonBuilding.geometry.coordinates[j])){
                                        overlappingPolygons.push(j);
                                        overlapExists = true;
                                    }
                                }
                                overlappingPolygonsPerPolygon[i] = overlappingPolygons;
                            }
                            // Create an error if overlapped polygons do exist, providing feature type and id of both allBuildings.  
                            // Also create an error object for this situation from the perspective of the comparison building.
                            if (overlapExists){
                                this.buildingOverlapErrors[building.id].push(makeErrorObj("BUILDING-OVERLAP-1", [comparisonBuilding.id], []));
                                this.buildingOverlapErrors[comparisonBuilding.id].push(makeErrorObj("BUILDING-OVERLAP-1", [building.id], []));
                                this.nonConformObjects.add(building.id);
                            }
                        }
                    }
                }
                else {
                    this.nonConformObjects.add(building.id);
                }
            }
        }
    }

    // Checks for faulty overlaps between all consistently typed level features of the current building.
    // A faulty overlap is when the levels of level features overlap and their geometries overlap too.  
    //
    // Creates according errors in the analyzer's levelFeatureOverlapErrors list,
    // each providing the ids of an overlapping feature pair and the levels on which this overlap occurs.
    checkLevelFeatureOverlaps(){
        
        // fault tolerance check
        if (!this.nonDoorTypesAnalyzed){
            throw Error("Geometry type - SIT type consistency has to be checked for all non door features before executing this functions.");
        }

        let allLevels = this.correctSITTypeObjects.levels;
        
        // Iterate over all levels.
        for (let currentLevelIdx = 0; currentLevelIdx < allLevels.length; currentLevelIdx++){
            
            let currentLvlFeature = allLevels[currentLevelIdx];
            
            // Iterate over all levels not compared yet.
            for (let comparisonLevelIdx = currentLevelIdx + 1; comparisonLevelIdx < allLevels.length; comparisonLevelIdx++){
                
                let comparisonLvlFeature = allLevels[comparisonLevelIdx];

                // Check level overlap.
                if (booleanLevelsOverlap(currentLvlFeature, comparisonLvlFeature)){

                    // Save overlapping levels for error references.
                    let overlappingLevels = [];
                    let comparisonLvlFeatureLvls = getLevelsAsNumbers(comparisonLvlFeature); 
                    for (const currentLvlFeatureLvl of getLevelsAsNumbers(currentLvlFeature)){
                        if (comparisonLvlFeatureLvls.includes(currentLvlFeatureLvl)){
                            overlappingLevels.push(currentLvlFeatureLvl);
                        }
                    }

                    // Check overlap of geometries.
                    if (boolPolygonOverlap(currentLvlFeature.geometry.coordinates, comparisonLvlFeature.geometry.coordinates)){
                        // Create the error object, providing the ids of the overlapping features and an array of their overlapping levels.
                        this.levelFeatureOverlapErrors.push(makeErrorObj("LVLOVERLAP-1", [currentLvlFeature.id, comparisonLvlFeature.id, overlappingLevels], [2]));
                        this.nonConformObjects.add(currentLvlFeature.id);
                        this.nonConformObjects.add(comparisonLvlFeature.id);
                    }
                }
            }
        }
    }
    
    // Utility function for adding non conform features form another source.
    // Needed for adding non conform objects from a TAGAnalyzer instance.
    addTagNonConformObjects(objectSet){
        var oldSet = this.nonConformObjects;
        this.nonConformObjects=new Set([...oldSet],[...objectSet]);
    }

    // Checks for consistent typing of objects, i.e. matching tagged SIT type and geometry type of a given feature.
    // Creates according preliminary error objects to be enriched with dynamic suggestions later in the SITAnalyzer's error list.
    doesGeometryMatchSITType(feature){
        var tags = feature.properties.tags;
        this.preliminaryGeometrySITTypeInconsistencyErrors[feature.id] = [];

        // Check if feature has an SIT type tag
        if (tags.door || ["level", "room", "area", "corridor", "wall"].includes(tags.indoor)){

            // Feature has a "door" and a "indoor key". Create the according preliminary error to be enriched with a dynamic suggestion later.
            if (tags.door && tags.indoor){
                this.preliminaryGeometrySITTypeInconsistencyErrors[feature.id].push(makeErrorObj("TYPE-3", [ feature.id ], []));
                this.incorrectSITTypeObjects.add(feature);
                this.nonConformObjects.add(feature.id);
            }

            // Check if feature is tagged as SIT area, which must have a polygon geometry.
            if (["level", "room", "area", "corridor"].includes(tags.indoor)){
                if (feature.geometry.type === "Polygon"){
                    this.correctSITTypeObjects[tags.indoor + "s"].push(feature);
                }
                else { 
                    this.preliminaryGeometrySITTypeInconsistencyErrors[feature.id].push(makeErrorObj("TYPE-2", [ feature.id, "'indoor=" + tags.indoor + "'", feature.geometry.type], []));
                    this.incorrectSITTypeObjects.add(feature);
                    this.nonConformObjects.add(feature.id);
                }
            }

            // Check if feature is tagged as SIT wall, which must have a LineString geometry.
            if (tags.indoor === "wall"){
                if (feature.geometry.type === "LineString"){
                    this.correctSITTypeObjects.walls.push(feature);
                }
                else {
                    this.preliminaryGeometrySITTypeInconsistencyErrors[feature.id].push(makeErrorObj("TYPE-2", [ feature.id, "'indoor=wall'", feature.geometry.type], []));
                    this.incorrectSITTypeObjects.add(feature);
                    this.nonConformObjects.add(feature.id);
                }
            }

            // Check if feature is tagged as SIT door, which must have a Point geometry.
            if (tags.door){
                if (feature.geometry.type === "Point"){
                    this.correctSITTypeObjects.doors.push(feature);
                }
                else { 
                    this.preliminaryGeometrySITTypeInconsistencyErrors[feature.id].push(makeErrorObj("TYPE-2", [ feature.id, "'door=" + tags.door + "'", feature.geometry.type], []));
                    this.incorrectSITTypeObjects.add(feature);
                    this.nonConformObjects.add(feature.id);
                }
            }
        }
        
        // Error: Object has no type.
        else { 
            this.preliminaryGeometrySITTypeInconsistencyErrors[feature.id].push(makeErrorObj("TYPE-1", [ feature.id ], []));
            this.incorrectSITTypeObjects.add(feature);
            this.nonConformObjects.add(feature.id);  
        }
    }
    
    // Adds dynamic suggestions to the preliminary error objects generated by 'doesGeometryMatchSITType' and adds them to the geometry sit type
    // inconsistency errors list.
	addSuggestionsToTypeInconsistencyErrors(building){
        if (!this.nonDoorTypesAnalyzed){
            throw Error("Type consistency of all objects must have tested beforehand.");
        }

        for (const feature of this.incorrectSITTypeObjects){
            var typeErrors = this.preliminaryGeometrySITTypeInconsistencyErrors[feature.id];

            var suggestionInfo = this.generateSuggestionInformation(feature, building);

            var noSuggestionsAppendix = "\n" + "Delete the feature or map it geometrically different, e.g. as a " + this.createGeometryAlternativesString(feature);
            var suggestionDoesNotApplyAppendix = "\n" + "If the suggestion does not apply in your eyes, delete the feature or map it geometrically different, e.g. as a " + this.createGeometryAlternativesString(feature);
            var suggestionsDoNotApplyAppendix = "\n" + "If the suggestions do not apply in your eyes, delete the feature or map it geometrically different, e.g. as a " + this.createGeometryAlternativesString(feature);

            // Feature has no SIT type. 
            if (typeErrors.length === 1 && typeErrors[0].id === "TYPE-1"){
                switch(suggestionInfo.suggestions.length){
                    case 0:
                    var suggestionString = "No SIT conform type tag can be suggested, because " +  this.createReasonsString(suggestionInfo.reasons) + ". " + noSuggestionsAppendix;
                        break;
                    case 1:
                        suggestionString = "Add the tag " + suggestionInfo.suggestions[0] + ", because " + this.createReasonsString(suggestionInfo.reasons) + ". " + suggestionDoesNotApplyAppendix;
                        break;
                    default:
                        suggestionString = "Add one of the tags " + this.createSuggestionsString(suggestionInfo.suggestions) + ", because " + this.createReasonsString(suggestionInfo.reasons) + ". " + suggestionsDoNotApplyAppendix;
                        break;
                }
                typeErrors[0].references = [ suggestionString ].concat(typeErrors[0].references);
            }

            // Feature has only one sit type tag that's inconsistent with its geometry type.
            else if (typeErrors.length === 1){
                switch(suggestionInfo.suggestions.length){
                    case 0:
                        suggestionString = "No SIT conform type tag can be suggested, because " +  this.createReasonsString(suggestionInfo.reasons) + ". " + noSuggestionsAppendix;
                        break;
                    case 1:
                        suggestionString = "Change the type tag to " + suggestionInfo.suggestions[0] + ", because " + this.createReasonsString(suggestionInfo.reasons) + ". " + suggestionDoesNotApplyAppendix;
                        break;
                    default:
                        suggestionString = "Change the type tag to one of the tags " + this.createSuggestionsString(suggestionInfo.suggestions) + ", because " + this.createReasonsString(suggestionInfo.reasons) + ". " + suggestionsDoNotApplyAppendix;
                        break;
                }
                typeErrors[0].references = [ suggestionString ].concat(typeErrors[0].references);
            }

            // Feature has two sit type tags and one of them is inconsistent with its geometry type.
            else if (typeErrors.length === 2){
                for (var i = 0; i < typeErrors.length; i++){
                    if (typeErrors[i].id === "TYPE-2"){
                        suggestionString = "Delete the tag.";
                    }
                    else if (typeErrors[i].id === "TYPE-3"){
                        if (feature.geometry.type === "Point"){
                            suggestionString = "Delete the 'indoor' tag and keep the 'door' tag."
                        }
                        else if (feature.geometry.type === "LineString" || feature.geometry.type === "Polygon"){
                            suggestionString = "Delete the 'door' tag and keep the 'indoor' tag.";
                        }
                    }
                    typeErrors[i].references = [ suggestionString ].concat(typeErrors[i].references);
                } 
            }

            // Feature has two sit type tags and both of them are inconsistent with its geometry type.
            else if (typeErrors.length === 3){
                for (i = 0; i < typeErrors.length; i++){
                    if (typeErrors[i].id === "TYPE-2"){
                        switch(suggestionInfo.suggestions.length){
                            case 0:
                                suggestionString = "No SIT conform type tag can be suggested, because " +  this.createReasonsString(suggestionInfo.reasons) + ". " + noSuggestionsAppendix;
                                break;
                            case 1:
                                suggestionString = "Change the type tag to " + suggestionInfo.suggestions[0] + ", because " + this.createReasonsString(suggestionInfo.reasons) + ". " + suggestionDoesNotApplyAppendix;
                                break;
                            default:
                                suggestionString = "Change the type tag to one of the tags " + this.createSuggestionsString(suggestionInfo.suggestions) + ", because " + this.createReasonsString(suggestionInfo.reasons) + ". " + suggestionsDoNotApplyAppendix;
                                break;
                        }
                    }
                    else if (typeErrors[i].id === "TYPE-3"){
                        switch(suggestionInfo.suggestions.length){
                            case 0: 
                                suggestionString = "No SIT conform type tag can be suggested, because " +  this.createReasonsString(suggestionInfo.reasons) + ". " + noSuggestionsAppendix;
                                break;
                            case 1:
                                suggestionString = "Delete the erroneous tags and add the tag " + suggestionInfo.suggestions[0] + ", because " + this.createReasonsString(suggestionInfo.reasons) + ". " + suggestionDoesNotApplyAppendix;
                                break;
                            default:
                                suggestionString = "Delete the erroneous tags and add one of the tags " + this.createSuggestionsString(suggestionInfo.suggestions) + ", because " + this.createReasonsString(suggestionInfo.reasons) + ". " + suggestionsDoNotApplyAppendix;
                                break;
                        }   
                    }
                    typeErrors[i].references = [ suggestionString ].concat(typeErrors[i].references);
                }
            }

            for (const typeError of typeErrors){
                this.geometrySITTypeInconsistencyErrors.push(typeError);
            }
        }
    }

    // Creates a formatted type suggestion string out of multiple type suggestions.
    createSuggestionsString(suggestions){
        var suggestionsString = "";
        for (var i = 0; i < suggestions.length; i++){
            if (i < suggestions.length - 2){
                suggestionsString += "" + suggestions[i] + ", ";
            }
            else if (i === suggestions.length - 2){
                suggestionsString += "" + suggestions[i] + " or ";
            }
            else {
                suggestionsString += "" + suggestions[i];
            }
        }
        return suggestionsString;
    }

    // Creates a formatted type suggestions reasons string out of multiple type suggestion reasons.
    createReasonsString(reasons){
        var reasonsString = "";
        for (var i = 0; i < reasons.length; i++){
            if (i < reasons.length - 2){
                reasonsString += "" + reasons[i] + ", ";
            }
            else if (i === reasons.length - 2){
                reasonsString += "" + reasons[i] + " and ";
            }
            else {
                reasonsString += "" + reasons[i];
            }
        }
        return reasonsString;
    }

    // Creates a string for recommending alternative geometries which could be used to map a feature, 
    // according to the feature's current geometry.
    createGeometryAlternativesString(feature){
        if (feature.geometry.type === "Point"){
            return "line string or polygon, instead of a point."
        }
        else if (feature.geometry.type === "LineString"){
            return "point or polygon, instead of a line string."
        }
        else if (feature.geometry.type === "Polygon"){
            return "point or line string, instead of a polygon."
        }
    }

    // Generates a list of type suggestions and a list of reasons for those suggestions for a given feature.
    // The parameter building is needed to check if the feature is on the building's borders if it could represent a door.
    generateSuggestionInformation(feature, building){
		
		var featureLevels = getLevelsAsNumbers(feature);
        
        // If the feature has a point geometry, it could only be a door.
        // Generate suggestions and reasons according to if it's positioned on a valid wall representation or not.
        if (feature.geometry.type === "Point"){
			
            let suggestedTagsString = "'door=*' if the feature should represent a passage between rooms, with or without door ";
            let isPotentialDoorOnWallRepresentationString = "('Door' passages should be situated on wall representations. "
            switch(this.doorFeatureIsOnWallRepresentation(building, feature, false)){
                case true:
                    isPotentialDoorOnWallRepresentationString += "" + "This one would be.)";
                    break;
                case false:
                    isPotentialDoorOnWallRepresentationString += "" + "This one wouldn't be.)";
                    break;
                case -1:
                    isPotentialDoorOnWallRepresentationString += "" + "Cannot be evaluated for this one because it has no valid 'level' or 'repeat_on' tag.)";
                    break;
                default:
                    throw Error("This case shouldn't happen if doorFeatureIsOnWallRepresentation outputs any of its supposed outputs.");    
            }
            suggestedTagsString += "" + isPotentialDoorOnWallRepresentationString;
            let suggestionReasonString = "geometrically, this feature is a point";
            return {
                suggestions: [
                    suggestedTagsString
                ],
                reasons: [
                    suggestionReasonString
                ]
            };
        }

        // If the feature has a LineString geometry, it could only be a wall.
        // Check for SIT rules for wall objects are not implemented, therefore always suggest the wall type.
        else if (feature.geometry.type === "LineString"){
			return {
					suggestions: [
						"'indoor=wall'"
					],
					reasons: [
						"the feature is a string of lines",
					]
			}
        }

        // If the feature has a Polygon geometry, it could be a room, corridor, area or level. 
        // Generate suggestions according to the faulty overlaps it would have if it was of the suggested SIT type.
        else if (feature.geometry.type === "Polygon"){
			
			if (!featureLevels || featureLevels === -1){
				return {
					suggestions: [
						"'indoor=room'",
						"'indoor=corridor'",
						"'indoor=area'",
						"'indoor=level'"
					],
					reasons: [
						"the feature is a polygon",
						"the feature has neither a valid 'level' nor a valid 'repeat_on' tag"
					]
				};
			}	
            
            var possibleSITTypesAndReasonPerRelation = [];
            
			// Check if the feature could be a level feature.
			// There must be no level features on this feature's levels and it must contain all other features on its levels for this
			// to be possible.
			var canBeLevel = true;
			for (const featureL of featureLevels){
				
				for (const l of this.correctSITTypeObjects.levels){
					var levelLevels = getLevelsAsNumbers(l);

					// Don't check if the level features does not have a valid 'level' or 'repeat_on' tag. 
					if (levelLevels !== false && levelLevels !== -1){
						if (levelLevels.includes(featureL)){
							canBeLevel = false; 
							break;
						}
					}
				}

				if (canBeLevel){
					for (const r of this.correctSITTypeObjects.rooms){
						let roomLevels = getLevelsAsNumbers(r);
						
						if (roomLevels !== false && roomLevels !== -1){
							if (roomLevels.includes(featureL)){
								if(!booleanContains(feature, r)){
									canBeLevel = false;
									break;
								}
							}	
						}
					}	
				}
				
				if (canBeLevel){
					for (const c of this.correctSITTypeObjects.corridors){
						let corridorLevels = getLevelsAsNumbers(c);
						
						if (corridorLevels !== false && corridorLevels !== -1){
							if (corridorLevels.includes(featureL)){
								if(!booleanContains(feature, c)){
									canBeLevel = false;
									break;
								}
							}	
						}
					}	
				}
				
				if (canBeLevel){
					for (const a of this.correctSITTypeObjects.areas){
						let areaLevels = getLevelsAsNumbers(a);
						
						if (areaLevels !== false && areaLevels !== -1){
							if (areaLevels.includes(featureL)){
								if(!booleanContains(feature, a)){
									canBeLevel = false;
									break;
								}
							}	
						}
					}	
				}
				
				if (canBeLevel){
					for (const w of this.correctSITTypeObjects.walls){
						let wallLevels = getLevelsAsNumbers(w);
						
						if (wallLevels !== false && wallLevels !== -1){
							if (wallLevels.includes(featureL)){
								if(!window.vectorDataManager.containsWithBoundary(feature, w)){
									canBeLevel = false;
									break;
								}
							}	
						}
					}	
				}
				
				if (canBeLevel){
					for (const d of this.correctSITTypeObjects.doors){
						let doorLevels = getLevelsAsNumbers(d);
						
						if (doorLevels !== false && doorLevels !== -1){
							if (doorLevels.includes(featureL)){
								if(!booleanPointInPolygon(feature, d)){
									canBeLevel = false;
									break;
								}
							}	
						}
					}	
				}
			}
			
			if (canBeLevel){
				possibleSITTypesAndReasonPerRelation.push({
					suggestions: 	["'indoor=level'"],
					reason:			"there are no level features on this feature's levels and on all of them all other features are contained by it"
				});
			}
				
			// Check if the feature could be a room.
			// This is the case if no room (this feature) - room (correctly typed rooms of the building) faults occur,
			// no corridor (correctly typed corridors of the building) - room (this feature) overlap faults occur and 
			// no area (correctly typed areas of the building) - room (this feature) overlap faults occur. 
			var roomRoomOverlapFaults = this.faultyRoomRoomOverlaps(feature, this.correctSITTypeObjects.rooms, true, true);
			var roomCorridorOverlapFaultExists = false;
			for (const corridor of this.correctSITTypeObjects.corridors){
				if (this.faultyCorridorRoomOverlaps(corridor, [feature], true, true).includes(true)){
					roomCorridorOverlapFaultExists = true;
					break;
				}	
			}
			var	roomAreaOverlapFaultExists = false;
			for (const area of this.correctSITTypeObjects.areas){
				if (this.faultyAreaRoomOverlaps(area, [feature], true, true).includes(true)){
					roomAreaOverlapFaultExists = true;
					break;
				}	
			}		
			
			
			if (!roomRoomOverlapFaults.includes(true) && !roomCorridorOverlapFaultExists && !roomAreaOverlapFaultExists){
				possibleSITTypesAndReasonPerRelation.push({
					suggestions: 	["'indoor=room'"],
					reason:			 	"there are no faulty overlaps with other features a room should not have"
				});
			}
			else {
				possibleSITTypesAndReasonPerRelation.push({
					suggestions:	[],
					reason:				"there are faulty overlaps with other features a room should not have"
				});
			}
			
			// Check if the feature could be a corridor.
			// This is the case if no corridor (this feature) - room (correctly typed rooms of the building) faults occur,
			// no corridor (this feature) - corridor (correctly typed corridors of the building) faults occur and
			// no area (correctly typed areas of the building) - corridor faults occur.
			var corridorRoomOverlapFaults = this.faultyCorridorRoomOverlaps(feature, this.correctSITTypeObjects.rooms, true, true);
			var corridorCorridorOverlapFaults = this.faultyCorridorCorridorOverlaps(feature, this.correctSITTypeObjects.corridors, true, true);
			var corridorAreaOverlapFaultExists = false;
			for (const area of this.correctSITTypeObjects.areas){
				if (this.faultyAreaCorridorOverlaps(area, [feature], true).includes(true)){
					corridorAreaOverlapFaultExists = true;
					break;
				}
			}
			
			if (!corridorRoomOverlapFaults.includes(true) && !corridorCorridorOverlapFaults.includes(true) && !corridorAreaOverlapFaultExists){
				possibleSITTypesAndReasonPerRelation.push({
					suggestions:	["'indoor=corridor'"],
					reason:			"there are no faulty overlaps with other features a corridor should not have"
				});
			}
			else {
				possibleSITTypesAndReasonPerRelation.push({
					suggestions:	[],
					reason:			"there are faulty overlaps with other features a corridor should not have"
				});
			}
			
			// Check if the feature could be an area.
			// This is the case if no area (this feature) - room (correctly typed rooms of the building) faults occur and
			// no area (this feature) - corridor (correctly typed corridors of the building) faults occur.
			var areaRoomOverlapFaults = this.faultyAreaRoomOverlaps(feature, this.correctSITTypeObjects.rooms, true);
			var areaCorridorOverlapFaults = this.faultyAreaCorridorOverlaps(feature, this.correctSITTypeObjects.areas, true);
			
			if (!areaRoomOverlapFaults.includes(true) && !areaCorridorOverlapFaults.includes(true)){
				possibleSITTypesAndReasonPerRelation.push({
					suggestions:	["'indoor=area'"],
					reason:			"there are no faulty overlaps with other features an area should not have"
				});
			}
			else {
				possibleSITTypesAndReasonPerRelation.push({
					suggestions:	[],
					reason:			"there are faulty overlaps with other features an area should not have"
				});	
			}		
		
			var suggestions = [];
			var reasons = [];
			for (const relation of possibleSITTypesAndReasonPerRelation){
				suggestions = suggestions.concat(relation.suggestions);
				reasons = reasons.concat(relation.reason);
			}

			return {
				suggestions:    suggestions,
				reasons:        reasons.concat(["this feature is a polygon"])
			};
        }
        else if (feature.geometry.type === "MultiPolygon"){
            return {
                suggestions: [],
                reasons: ["indoor features should not have a multi-polygon geometry."]
            };
        }	
    }

    // Checks for faulty overlaps of the given 'feature' with the polygons given by the features in comparisonFeatures array.
    // Can be applied to any features with a 'Polygon' geometry, but *rules for overlaps of rooms and corridors are applied!* 
    // Saves sets of validly overlapping features per 'feature' (and comparison feature) and given 'building'.
    //
    // The function has three mode parameters. The respective mode can be switched on by inputting true.
    //  - onlyCheckForExistance: 
    //    If onlyCheckForExistance is not set, the function returns an array containing according information for each fault occurance.
    //    Otherwise, the function only returns if a faulty overlap of each type exists, which saves performance in comparison.
    //  - dontSaveValidOverlaps:
    //    If dontSaveValidOverlaps is not set, valid overlap sets are created for each feature which is evaluated. If it's set
    //    and it's true, those won't be generated. This is used when generating suggestion information for the different features.
    //  - allFeaturesAreCorridors:
    //    Between corridors, intersections without containment cannot be faulty and will therefore not be checked.  
    //
    // The different types of faulty overlaps are:
    //  - mutual containment of two features while their levels overlap
    //  - faulty multi-level containment
    //      : If a room / corridor spans multiple levels and has the 'level' tag, it forms a multi-level room / corridor.
    //      : Faulty multi-level rooms / corridors may have multiple of those level ranges, called 'multiLevel'.
    //      : If a room / corridor is contained by another room / corridor, all multi-levels of the containing room / corridor which 
    //      : overlap with the contained room's / corridor's multi-levels must include at least one level value that's not part of both 
    //      : multi-levels. (multi level contained fault)
    //      : If a room is containing another room, the rule above applies vice versa. (multi level containing fault)
    //  - faulty intersection of two feature while their levels overlap
    //      : If two overlapping multi-levels of the features are equal.
    //      : No faulty intersections between corridors.
    faultyFeatureFeatureOverlaps(feature, comparisonFeatures, onlyCheckForExistance, dontSaveValidOverlaps, allFeaturesAreCorridors){

        // checks for faulty inputs //
        // parameter 'feature'
        if (feature.geometry.type !== "Polygon"){
            throw Error("The parameter feature does not have a 'Polygon' geometry.");
        }

        // parameter 'comparisonFeatures'
        if (!comparisonFeatures.hasOwnProperty("length")){
            throw Error("The parameter comparisonFeatures is no array.");
        }
        else {
            for (let i = 0; i < comparisonFeatures.length; i++){
                if (comparisonFeatures[i].geometry.type !== "Polygon"){
                    throw Error("Element of index '" + i + "' of parameter comparisonFeatures has no geometry of the type 'Polygon'.");
                }
            }
        }

        // Create empty sets to save validly contained / containing / intersecting rooms and corridors per 'feature'.
        // Used in checking for faulty overlaps of areas. Sets are created here to save performance there. 
        this.createValidOverlapsSetsIfMissing(feature);

        // Set variable for switching between checking for all fault occurances / checking for at least one occurance of each type.
        var checkForAllFaultOccurances;
        onlyCheckForExistance ? checkForAllFaultOccurances = false : checkForAllFaultOccurances = true;

        // array of fault occurances to be returned when onlyCheckForExistance === undefined or === false
        var faultyOverlaps = [];
        // booleans for occurance of the different fault types to be returned when onlyCheckForExistance !== undefined and !== false
        // fault types are described in comments above function header
        var mutualContainmentFaultExists = false;
        var multiLevelContainedFaultExists = false;
        var multiLevelContainingFaultExists = false;
        var faultyMultiLevelIntersectExists = false;

        // Iterate over all comparison features (*should* be rooms or corridors) of the given building.
        for (const comparisonFeature of comparisonFeatures){

            // tolerance against comparisonFeatures containing the feature
            if (feature.id !== comparisonFeature.id){

                // Create empty sets to save validly contained / containing / intersecting rooms and corridors per comparison feature.
                // Used in checking for faulty overlaps of areas. Sets are created here to save performance there. 
                this.createValidOverlapsSetsIfMissing(comparisonFeature);

                // Stop comparison in onlyCheckForExistance mode if all fault types occured at least once.
                if (mutualContainmentFaultExists && multiLevelContainedFaultExists && multiLevelContainingFaultExists && faultyMultiLevelIntersectExists && !checkForAllFaultOccurances){
                    break;
                }

                // Check if the level intervals of the features overlap.
                if (booleanLevelsOverlap(feature, comparisonFeature)){

                    // If a feature is fully contained by or fully containing a comparisonFeature, there can't be an intersection. 
                    // Therefore isContained prevents checks for intersections from happening. Also, the check for containing without
                    // mutual containment will not happen if it's set to true.
                    // isContaining will be set in the part for containing without mutual containment and will prevent the check for intersections
                    let isContained = false;
                    let isContaining = false;

                    // Check if the feature being analyzed is contained by this comparison room.
                    if (booleanContains(comparisonFeature, feature)){

                        isContained = true;
                        // When a mutual containment fault is found, isMutualContainment will be set to 'true' and prevent the execution of checks for
                        // other ways of being faultily contained.   
                        let isMutualContainment = false;

                        // mutual containment check
                        if (booleanContains(feature, comparisonFeature)){
                            
                            isMutualContainment = true;
                            
                            if (checkForAllFaultOccurances){
                                faultyOverlaps.push([[feature.id, comparisonFeature.id], "mutualContainment"]);
                                this.nonConformObjects.add(feature.id);
                                this.nonConformObjects.add(comparisonFeature.id);
                            }
                            else {
                                mutualContainmentFaultExists = true;
                            }
                        }

                        // Check for being multi-level contained in a faulty way is only done in onlyCheckForExistance mode until such a fault was found.
						// Not done if the compared features mutually contain each other.
                        if ((!multiLevelContainedFaultExists || checkForAllFaultOccurances) && !isMutualContainment) {

                            // faulty multi-level overlaps check
                            let faultyMultiLevelOverlaps = this.checkFaultyMultiLevelOverlap(feature, comparisonFeature, onlyCheckForExistance);
                                
                            // Faulty overlaps exist.
                            if (faultyMultiLevelOverlaps !== false){
                                if (checkForAllFaultOccurances){
                                    faultyOverlaps.push([[feature.id, comparisonFeature.id, faultyMultiLevelOverlaps], "multiLevelContained" ]);
                                    this.nonConformObjects.add(feature.id);
                                    this.nonConformObjects.add(comparisonFeature.id);
                                }
                                else {
                                    multiLevelContainedFaultExists = true;
                                }
                            }
                            // No faulty overlaps exist. => Save relationship of valid containment between features.
                            else {
								if (dontSaveValidOverlaps !== true){
									this.validlyContainedRoomsAndCorridors[comparisonFeature.id].add(feature);
									this.validlyContainingRoomsAndCorridors[feature.id].add(comparisonFeature); 
								}	
                            }
                        }
                    }
                    
                    // Check for faults of containing are only done if the feature is not contained by the comparison feature.
                    if (!isContained){

                        // Check if 'feature' is containing 'comparisonFeature' horizontally.
                        if (booleanContains(feature, comparisonFeature)){

                            isContaining = true;

                            if (!multiLevelContainingFaultExists || checkForAllFaultOccurances){
                            
                                // fauly multi-level overlaps check
                                let faultyMultiLevelOverlaps = this.checkFaultyMultiLevelOverlap(comparisonFeature, feature, onlyCheckForExistance);

                                // Faulty overlaps exist.
                                if (faultyMultiLevelOverlaps !== false){
                                    if (checkForAllFaultOccurances){
                                        faultyOverlaps.push([[feature.id, comparisonFeature.id, faultyMultiLevelOverlaps], "multiLevelContaining"]);
                                        this.nonConformObjects.add(feature.id);
                                        this.nonConformObjects.add(comparisonFeature.id);
                                    }
                                    else {
                                        multiLevelContainingFaultExists = true;
                                    }
                                }
                                // No faulty overlaps exist. => Save relationship of valid containment between features.
                                else {
									if (dontSaveValidOverlaps !== true){
										this.validlyContainedRoomsAndCorridors[feature.id].add(comparisonFeature);
										this.validlyContainingRoomsAndCorridors[comparisonFeature.id].add(feature);
									}	
                                }
                            }
                        }
                    }

                    // Check for faulty multi-level intersection is only done onlyCheckForExistance mode until such a fault was found.
                    // Is not done if 'feature' is contained by the comparison feature. Is also not done, if 'feature' contains the comparison feature.
                    // Is not done if the parameter 'allFeaturesAreCorridors' is true. Corridors may intersect in any way if they don't contain each other.
                    if ((!faultyMultiLevelIntersectExists || checkForAllFaultOccurances) && !isContained && !isContaining && allFeaturesAreCorridors !== true){

                        // Check if the borders of 'feature' and the comparisonFeature intersect.
                        if (boolPolygonBordersIntersected(comparisonFeature, feature)){

                            // Check for faulty multi-level overlaps.
                            let faultyMultiLevelOverlaps = this.checkFaultyMultiLevelOverlap(feature, comparisonFeature, onlyCheckForExistance, true);
                            
                            // Faulty overlaps exist.
                            if (faultyMultiLevelOverlaps !== false){
                                if (checkForAllFaultOccurances){
                                    faultyOverlaps.push([[feature.id, comparisonFeature.id, faultyMultiLevelOverlaps], "multiLevelIntersect"]);
                                    this.nonConformObjects.add(feature.id);
                                    this.nonConformObjects.add(comparisonFeature.id);
                                }
                                else {
                                    faultyMultiLevelIntersectExists = true;
                                }
                            }
                            // No faulty overlaps exist. => Save relationship of valid containment between features.
                            else {
								if (dontSaveValidOverlaps !== true){
									this.validlyIntersectingRoomsAndCorridors[feature.id].add(comparisonFeature);
									this.validlyIntersectingRoomsAndCorridors[comparisonFeature.id].add(feature);
								}
                            }
                        }
                    }
                }
            }
        }

        if (checkForAllFaultOccurances){
            return faultyOverlaps;
        }
        else {
            // There are no faulty multi-level intersections that may occur between corridors. Therefore exclude that boolean in returned output.
            if (allFeaturesAreCorridors === true){
                return [mutualContainmentFaultExists, multiLevelContainedFaultExists, multiLevelContainingFaultExists];
            }
            else {
                return [mutualContainmentFaultExists, multiLevelContainedFaultExists, multiLevelContainingFaultExists , faultyMultiLevelIntersectExists];
            }            
        }
    }

    // Creates empty sets of validly contained / containing / intersecting rooms and corridors for a given building and feature,
    // if they are undefined.
    createValidOverlapsSetsIfMissing(feature){
        if (this.validlyContainingRoomsAndCorridors[feature.id] === undefined){
            this.validlyContainingRoomsAndCorridors[feature.id] = new Set([]);
        }
        if (this.validlyContainedRoomsAndCorridors[feature.id] === undefined){
            this.validlyContainedRoomsAndCorridors[feature.id] = new Set([]);
        }
        if (this.validlyIntersectingRoomsAndCorridors[feature.id] === undefined){
            this.validlyIntersectingRoomsAndCorridors[feature.id] = new Set([]);
        }
    }
    
    // Checks for faulty overlaps between the multi-levels of the given features feature and comparisonFeature,
    // which are assumed to be rooms. An overlap between two multi-levels of both features is faulty, if 
    // the respective multi-level of the comparisonFeature doesn't have any levels which are not in 'feature''s multi-level.
    // 
    // If the flag 'intersect' is set to true, rules for intersecting features are applied. Then, an overlap is only faulty if the
    // overlapping multi-levels are equal.
    // If the flag 'onlyCheckForExistance' is set to true, the function will return true, if such a fault exists, false
    // otherwise. Otherwise it will return an array of level ranges of both features where their multi-levels overlap.
    // If there's no fault, the function will return false.
    checkFaultyMultiLevelOverlap(feature, comparisonFeature, onlyCheckForExistance, intersect){
        
        // arrays of multi-level ranges of both features to be compared
        var featureMultiLevels = getLevelsAsMultilevelGroups(feature);
        var comparisonFeatureMultiLevels = getLevelsAsMultilevelGroups(comparisonFeature);

        // End multi-level containment check if one of the features in comparison doesn't have
        // a valid 'level' or 'repeat_on' tag.
        if (!(featureMultiLevels === false || featureMultiLevels === -1 ||
              comparisonFeatureMultiLevels === false || comparisonFeatureMultiLevels === -1)){

            // array which will be returned attached to a fault, containing the level ranges where both features'
            // level ranges overlap
            let faultyMultiLevelOverlaps = [];
                    
            // Iterate over all multi-levels of the feature being analyzed.
            for (const featureMultiLevel of featureMultiLevels){

                // Find all multi-levels of the comparison feature which overlap with the current featureMultiLevel.
                // Current featureMultiLevel will be skipped if none is found.
                let containingMultiLevels = getContainingMultiLevels(featureMultiLevel, comparisonFeatureMultiLevels);

                // array for aggregating level ranges in which the current multi-level of the analyzed room
                // overlaps with any of its containing multi levels
                let currentMultiLevelFaultyMultiLevelOverlaps = [];

                // Iterate over all multi-levels which overlap with featureMultiLevel.
                for (const containingMultiLevel of containingMultiLevels){
                    
                    // For a fault, the multi-level of the current consistently typed room must have no levels which
                    // are not also part of the featureMultiLevel.
                    if (!boolLevelRangeHasNonCommonValues(featureMultiLevel, containingMultiLevel)){

                        // Check for intersection faults, if the parameter intersect is true.
                        if (intersect === true){

                            // It is acceptable when a room's multi-level intersects another's multi-level, if 
                            // one of the multi-levels contains the other. That's why only if both level ranges
                            // are equal a fault occurs.
                            // Symmetric boolLevelRangeHasNonCommonValues() === true means the multi-levels are equal.
                            if (!boolLevelRangeHasNonCommonValues(containingMultiLevel, featureMultiLevel)){
                                if (onlyCheckForExistance === undefined || onlyCheckForExistance === false){
                                    currentMultiLevelFaultyMultiLevelOverlaps.push(containingMultiLevel);
                                }
                                else {
                                    return true;
                                } 
                            }
                        }

                        // Check for containment faults, if the parameter intersect is not true.
                        // Rules as described in function description.
                        else {
                            if (onlyCheckForExistance === undefined || onlyCheckForExistance === false){
                                
                                for (const featureMultiLevelLevel of featureMultiLevel){
                                    if (containingMultiLevel.includes(featureMultiLevelLevel)){
                                        currentMultiLevelFaultyMultiLevelOverlaps.push(featureMultiLevelLevel);
                                    }
                                }
                            }
                            else {
                                return true;
                            } 
                        }     
                    }
                }
                // Fill array of levels overlapping between the multi-levels of both features.
                faultyMultiLevelOverlaps = faultyMultiLevelOverlaps.concat(currentMultiLevelFaultyMultiLevelOverlaps);
            }
            
            if (faultyMultiLevelOverlaps.length > 0){
                return faultyMultiLevelOverlaps; 
            }
            else {
                return false;
            }
        }
        else {
            return false;
        }
    }

    // Checks for faulty overlaps of the given 'roomFeature' with the room polygons given by the feature array comparisonRooms.
    // All features must have a 'Polygon' geometry!
    // Saves sets of validly overlapping features per given 'roomFeature' and given 'building'.
    //
    // Calls faultyFeatureFeatureOverlaps() without the optional parameter allFeaturesAreCorridors.
    // Look there for rules determining what a faulty overlap is. 
    faultyRoomRoomOverlaps(roomFeature, comparisonRooms, onlyCheckForExistance, dontSaveValidOverlaps){
        return this.faultyFeatureFeatureOverlaps(roomFeature, comparisonRooms, onlyCheckForExistance, dontSaveValidOverlaps);
    }

    // Checks for faulty overlaps of the given 'corridorFeature' with the room polygons given by the feature array comparisonRooms.
    // All features must have a 'Polygon' geometry.
    // Saves sets of validly overlapping features per given 'corridorFeature' and given 'building'.
    // 
    // Calls faultyFeatureFeatureOverlaps() without the optional parameter allFeaturesAreCorridors.
    // Look there for rules determining what a faulty overlap is. 
    faultyCorridorRoomOverlaps(corridorFeature, comparisonRooms, onlyCheckForExistance, dontSaveValidOverlaps){
        return this.faultyFeatureFeatureOverlaps(corridorFeature, comparisonRooms, onlyCheckForExistance, dontSaveValidOverlaps);
    }

    // Checks for faulty overlaps of the given 'corridorFeature' with the corridor polygons given by the feature array comparisonCorridors.
    // All features must have a 'Polygon' geometry.
    // Saves sets of validly overlapping features per given 'corridorFeature' and given 'building'.
    // 
    // Calls faultyFeatureFeatureOverlaps() with the optional parameter allFeaturesAreCorridors.
    // Look there for rules determining what a faulty overlap is. 
    faultyCorridorCorridorOverlaps(corridorFeature, comparisonCorridors, onlyCheckForExistance, dontSaveValidOverlaps){
        return this.faultyFeatureFeatureOverlaps(corridorFeature, comparisonCorridors, onlyCheckForExistance, dontSaveValidOverlaps, true);
    }

    // Checks for faulty overlaps of the given 'areaFeature' with the polygons given by the features in comparisonFeatures array.
    // Can be applied to any features with a 'Polygon' geometry, but *rules for overlaps of areas with corridors or rooms are applied!* 
    // Uses sets of validly overlapping features per given comparison feature and given 'building'.
    //
    // The function has two mode parameters. The respective mode can be switched on by inputting true.
    //  - onlyCheckForExistance: 
    //    If onlyCheckForExistance is not set, the function returns an array containing according information for each overlap type.
    //    Otherwise, the function only returns if a faulty overlap of each type exists, which saves performance in comparison.
    //  - compareToCorridors:
    //    Intersections between areas and corridors can't be faulty. If this parameter is 'true', intersections will be checked, assuming
    //    'comparisonFeatures' contains corridors.  
    //
    // The different types of faulty overlaps are:
    //  - mutual containment of an area and a feature, if not all multi-levels of the area are fully contained by the multi-levels which
    //    partly contain them 
    //  - faulty multi-level containment
    //      : If an area / corridor spans multiple levels and has the 'level' tag, it forms a multi-level room / corridor.
    //      : Faulty multi-level areas / corridors may have multiple of those level ranges, called 'multiLevel'.
    //      : If an area horizontally contains a room / corridor, and there's no mutual containment, it needs to be (horizontally and vertically fully) 
    //      : in a validly overlapping corridor / room of the comparisonFeature (containing fault if not). Another type of containing fault occurs,
	//		: when a containing area's levels are all also levels of the contained feature, because the area should be deleted where the contained feature is,
	//		: in this case.
    //      : If an area is horizontally contained by a room / corridor, and there's no mutual containment, and it's vertically not fully contained
    //      : by the horizontally containing room / corridor, it needs to be (horizontally and vertically fully) in in a validly overlapping 
    //      : corridor / room of the comparisonFeature (contained fault if not).
    //  - faulty intersection of two features while their levels overlap
    //      : If an area intersects a room or corridor, and their levels overlap, it needs to be in a validly intersecting room / corridor of the intersected room.
    //      : (intersection fault if not). Another type of intersection fault occurs, when an intersecting area's levels are all also levels of the intersected
	//		: feature, because in this case the area should be deleted where the intersected feature is.
    faultyAreaFeatureOverlaps(areaFeature, comparisonFeatures, onlyCheckForExistance){
        
        // checks for faulty inputs //
        // parameter 'areaFeature'
        if (areaFeature.geometry.type !== "Polygon"){
            throw Error("The parameter areaFeature does not have a 'Polygon' geometry.");
        }

        // parameter 'comparisonFeatures'
        if (!comparisonFeatures.hasOwnProperty("length")){
            throw Error("The parameter 'comparisonFeatures' is no array.");
        }
        else {
            for (let i = 0; i < comparisonFeatures.length; i++){
                if (comparisonFeatures[i].geometry.type !== "Polygon"){
                    throw Error("Element of index '" + i + "' of parameter comparisonFeatures has no geometry of the type 'Polygon'.");
                }
            }
        }

        if (!this.corridorAndRoomOverlapsAnalyzed){
            throw Error("Room-room and corridor-room overlaps have to be analyzed to know validly overlapping features, which is a requirement for the area-feature overlaps analysis.");
        }

        // Set variable for switching between checking for all fault occurances / checking for at least one occurance of each type.
        var checkForAllFaultOccurances;
        onlyCheckForExistance ? checkForAllFaultOccurances = false : checkForAllFaultOccurances = true;

        // array of fault occurances to be returned when onlyCheckForExistance === undefined or === false
        var faultyOverlaps = [];
        // booleans for occurance of the different fault types to be returned when onlyCheckForExistance !== undefined and !== false
        // faulty types are described in comments above function header
        var mutualContainmentFaultExists = false;
        var containingFaultExists = false;
        var containedFaultExists = false;
        var intersectFaultExists = false;

        // Iterate over all comparison features (rooms or corridors).
        for (const comparisonFeature of comparisonFeatures){

            // Stop comparison in onlyCheckForExistance mode if all fault types occured at least once.
            if (mutualContainmentFaultExists && containingFaultExists && containedFaultExists && intersectFaultExists && !checkForAllFaultOccurances){
                break;
            }

            // Check if the level intervals of the features overlap.
            if (booleanLevelsOverlap(areaFeature, comparisonFeature)){

                // If an area feature is fully (horizontally) containing a comparison feature or contained by it, there can't be intersections.
                // Therefore, isContaining or isContained will disable the checks for intersection faults when set to true.
                // When isContaining === true, the check for being contained without mutual containment will be disabled.
                let isContaining = false;
                let isContained = false;

                // Create empty sets to save validly contained / containing / intersecting rooms and corridors per comparison feature.
                // Used in checking for faulty overlaps of areas. Sets are created here to avoid undefined errors. 
                this.createValidOverlapsSetsIfMissing(comparisonFeature);

                // Check if area feature is contained.
                if (booleanContains(areaFeature, comparisonFeature)){

                    // When a mutual containment fault is found, isMutualContainment will be set to 'true' and prevent the execution of checks for
                    // other ways of being faultily containing.   
                    let isMutualContainment = false;
                    isContaining = true;

                    // Check for mutual containment.
                    if (booleanContains(comparisonFeature, areaFeature)){

                        isMutualContainment = true;
						
						// To prevent checking for other containment faults and intersect faults, one needs to check for mutualContainment for each feature pair,
						// even if a mutual containment fault already exists in onlyCheckForExistance mode. But everything else regarding this fault will be skipped,
						// if that's the case.
                        if (!mutualContainmentFaultExists || checkForAllFaultOccurances){
                        
                            // arrays of multi-level ranges of both features to be compared
                            let areaFeatureMultiLevels = getLevelsAsMultilevelGroups(areaFeature);
                            let comparisonFeatureMultiLevels = getLevelsAsMultilevelGroups(comparisonFeature);

                            // End mutual containment check if one of the features in comparison doesn't have
                            // a valid 'level' or 'repeat_on' tag.
                            if (areaFeatureMultiLevels !== false && areaFeatureMultiLevels !== -1 && comparisonFeatureMultiLevels !== false && comparisonFeatureMultiLevels !== -1){
                                    
                                // array to save levels of the area feature which are not contained by the levels
                                // of the comparison features
                                // such levels existing = mutual containment fault)
                                let notContainedLevels = [];
                                    
                                // Iterate over multi-levels of the area feature.
                                for (const areaFeatureMultiLevel of areaFeatureMultiLevels){
                                        
                                    // One faulty level in a multi-level suffices for existance check.
                                    // => Stop iteration.
                                    if (mutualContainmentFaultExists){
                                        break;
                                    }
                                        
                                    // Find all multi-levels of the comparison feature which overlap with the current featureMultiLevel.
                                    // Current featureMultiLevel will be skipped if none is found.
                                    let containingMultiLevels = getContainingMultiLevels(areaFeatureMultiLevel, comparisonFeatureMultiLevels);
                                        
                                    // Iterate over all levels of multi-level.
                                    for (const areaFeatureMultiLevelLevel of areaFeatureMultiLevel){
                                            
                                        // Check if level is contained by any of the multi-levels overlapping
                                        // with the current multi-level of the area feature.
                                        // If not, add to notContainedLevels list or change mutualContainmentFaultExists boolean.
                                        let levelIsContained = false;
                                        for (const containingMultiLevel of containingMultiLevels){
                                            if (containingMultiLevel.includes(areaFeatureMultiLevelLevel)){
                                                levelIsContained = true;
                                                break;
                                            }    
                                        }
                                        if (!levelIsContained){
                                            if (checkForAllFaultOccurances){
                                                notContainedLevels.push(areaFeatureMultiLevelLevel);
                                            }
                                            else {
                                                mutualContainmentFaultExists = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                                    
                                // Save fault information in checkForAllFaultOccurances mode, providing all levels of
                                // the area that are not contained by the containing feature's level range.
                                if (notContainedLevels.length > 0){
                                    faultyOverlaps.push([[areaFeature.id, comparisonFeature.id, notContainedLevels], "mutualContainment"]);
                                    this.nonConformObjects.add(areaFeature.id);
                                    this.nonConformObjects.add(comparisonFeature.id);
                                }
                            }
                        }
                    }
                    
                    // Check for the area feature containing a room / corridor in a faulty way is only done in onlyCheckForExistance
                    // mode until such a fault has occured. Not done, if the feature of the pair mutually contain each other.
                    if ((!containingFaultExists || checkForAllFaultOccurances) && !isMutualContainment){
                            
                        // The area feature must be horizontally and vertically contained by a room or corridor which 
                        // validly contains the comparison feature horizontally and has a level range that overlaps
                        // with the comparison feature's levels.
                        // This boolean is to save that fact.
                        let areaIsPartOfValidatingFeature = false;
                            
                        // Check for every validly containing room or corridor if it fully contains the area feature.
                        for (const validlyContainingRoomOrCorridor of this.validlyContainingRoomsAndCorridors[comparisonFeature.id]){
                            if (booleanVerticallyAndHorizontallyContains(validlyContainingRoomOrCorridor, areaFeature)){
                                areaIsPartOfValidatingFeature = true;
                                break;
                            }
                        }
                            
                        // If the area feature is not fully contained, change the boolean containingFaultExists or
                        // save fault information for this fault occurance.
                        if (!areaIsPartOfValidatingFeature){
                            if (checkForAllFaultOccurances){
                                faultyOverlaps.push([[areaFeature.id, comparisonFeature.id], "containingNotValidated"]);
                                this.nonConformObjects.add(areaFeature.id);
                                this.nonConformObjects.add(comparisonFeature.id);
                            }
                            else {
                                containingFaultExists = true;
                            }
                        }
                        
						// In onlyCheckForExistance mode, one doesn't care if both kinds of containing fault exist or just one,
						// therefore the check for faulty containing (independently of being contained by a validating feature) is prevented,
						// if the containing feature already is not part of a validating feature. 
                        if (!containingFaultExists || checkForAllFaultOccurances){

                            // level arrays of the area feature and the comparison feature
                            let areaFeatureLevels = getLevelsAsNumbers(areaFeature);
                            let comparisonFeatureLevels = getLevelsAsNumbers(comparisonFeature);

                            // Skip this comparison if one of the objects doesn't have a valid 'repeat_on' or 'level' tag.
                            if (areaFeatureLevels !== false && areaFeatureLevels !== -1 && comparisonFeatureLevels !== false && comparisonFeatureLevels !== -1){

                                // If the check succeeds:
                                // Set containingFaultExists to true when in onlyCheckForExistance mode.
                                // Save the according fault information otherwise.
                                if (booleanAllLevelsIncluded(areaFeatureLevels, comparisonFeatureLevels)){
                                    if (checkForAllFaultOccurances){
                                        faultyOverlaps.push([[areaFeature.id, comparisonFeature.id], "containedPartOfAreaCanBeDeleted"]);
                                        this.nonConformObjects.add(areaFeature.id);
                                        this.nonConformObjects.add(comparisonFeature.id);    
                                    }
                                    else {
                                        containingFaultExists = true;
                                    }
                                }
                            }
                        }
                    }   
                }
             
                
                // Only check for faults of being contained if the feature does not contain the comparison feature.
                if (!isContaining){
                    
                    // Check if the comparison feature horizontally contains the area feature.
                    if (booleanContains(comparisonFeature, areaFeature)){
                        
                        // arrays of levels of both features given by their 'repeat_on' or 'level' tag
                        let areaFeatureLevels = getLevelsAsNumbers(areaFeature);
                        let comparisonFeatureLevels = getLevelsAsNumbers(comparisonFeature);

                        isContained = true;
                        
                        if (!containedFaultExists || checkForAllFaultOccurances){
                        
                            // End check for faulty containment if one of the features in comparison doesn't have
                            // a valid 'level' or 'repeat_on' tag.
                            if (areaFeatureLevels !== false && areaFeatureLevels !== -1 && comparisonFeatureLevels !== false && comparisonFeatureLevels !== -1){
                            
                                // An area feature is always validly contained, if all its levels are also levels of the comparison feature.
                                // Only continue check for fault if that's not the case.
                                if (!booleanAllLevelsIncluded(areaFeatureLevels, comparisonFeatureLevels)){
                                    faultyOverlaps.push([[areaFeature.id, comparisonFeature.id], "contained"]);
                                    this.nonConformObjects.add(areaFeature.id);
                                    this.nonConformObjects.add(comparisonFeature.id);
                                }
                            }   
                        }
                    }
                }    
    
                // Check for faulty intersections is only done once in onlyCheckForExistance mode until such a fault was found.
                // Also, no intersection needed for corridor-corridor relationships.
                // Usage of isContained is explained where it's declared, the same goes for isContaining.
                if ((!intersectFaultExists || checkForAllFaultOccurances) && !isContaining && !isContained){
                    
                    // Check for existance of intersections between feature polygons.
                    if (boolPolygonBordersIntersected(areaFeature, comparisonFeature)){
                        
                        // The intersecting area feature must be horizontally and vertically contained by a room or corridor which 
                        // is validly contained by the comparison feature horizontally and has a level range that overlaps
                        // with the comparison feature's levels.
                        // This boolean is to save that fact.
                        let areaIsPartOfValidatingFeature = false;
                        for (const validlyIntersectingRoomOrCorridor of this.validlyIntersectingRoomsAndCorridors[comparisonFeature.id]){
                            if (booleanVerticallyAndHorizontallyContains(validlyIntersectingRoomOrCorridor, areaFeature)){
                                areaIsPartOfValidatingFeature = true;
                                break;
                            }
                        }    
                            
                        // If the area feature is not fully contained, change the boolean intersectFaultExists or
                        // save fault information for this fault occurance.
                        if (!areaIsPartOfValidatingFeature){
                            if (checkForAllFaultOccurances){
                                faultyOverlaps.push([[areaFeature.id, comparisonFeature.id], "intersectingNotValidated"]);
                                this.nonConformObjects.add(areaFeature.id);
                                this.nonConformObjects.add(comparisonFeature.id);
                            }
                            else {
                                intersectFaultExists = true;
                            }
                        }
                        
						// In onlyCheckForExistance mode, one doesn't care if both kinds of intersection fault exist or just one,
						// therefore the check for faulty intersecting because of level values is prevented if an intersect fault exists
						// because of not being contained by a validating feature.
                        if (!intersectFaultExists || checkForAllFaultOccurances){
                            // level arrays of the area feature and the comparison feature
                            let areaFeatureLevels = getLevelsAsNumbers(areaFeature);
                            let comparisonFeatureLevels = getLevelsAsNumbers(comparisonFeature);

                            // Skip this comparison if one of the objects doesn't have a valid 'repeat_on' or 'level' tag.
                            if (areaFeatureLevels !== false && areaFeatureLevels !== -1 && comparisonFeatureLevels !== false && comparisonFeatureLevels !== -1){

                                // If the check succeeds:
                                // Set intersectFaultExists to true when in onlyCheckForExistance mode.
                                // Save the according fault information otherwise.
                                if (booleanAllLevelsIncluded(areaFeatureLevels, comparisonFeatureLevels)){
                                    if (checkForAllFaultOccurances){
                                        faultyOverlaps.push([[areaFeature.id, comparisonFeature.id], "intersectingPartOfAreaCanBeDeleted"]);
                                        this.nonConformObjects.add(areaFeature.id);
                                        this.nonConformObjects.add(comparisonFeature.id);    
                                    }
                                    else {
                                        intersectFaultExists = true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        if (checkForAllFaultOccurances){
            return faultyOverlaps;
        }
        else {
            return [mutualContainmentFaultExists, containingFaultExists, containedFaultExists, intersectFaultExists];
        }
    }
    
    // Checks for faulty overlaps of the 'areaFeature' with the polygons of the 'comparisonRooms'.
    // All features must have a 'Polygon' geometry.
    // Uses sets of valid overlaps between features per building and comparison room.
    //
    // What kinds of faulty overlaps there are and what the parameter 'onlyCheckForExistance' does can be looked in the
    // comments above the function header. 
    faultyAreaRoomOverlaps(areaFeature, comparisonRooms, onlyCheckForExistance){
        return this.faultyAreaFeatureOverlaps(areaFeature, comparisonRooms, onlyCheckForExistance);
    }
    
    // Checks for faulty overlaps of the 'areaFeature' with the polygons of the 'comparisonCorridors'.
    // All features must have a 'Polygon' geometry.
    // Uses sets of valid overlaps between features per building and comparison corridor.
    //
    // What kinds of faulty overlaps there are and what the parameter 'onlyCheckForExistance' does can be looked in the
    // comments above the function header. 
    faultyAreaCorridorOverlaps(areaFeature, comparisonCorridors, onlyCheckForExistance){
        return this.faultyAreaFeatureOverlaps(areaFeature, comparisonCorridors, onlyCheckForExistance);
    }

    // Checks if a doorFeature in a given building is situated on any of the consistently typed objects.
    // Check for consistenly typed features via doesGeometryMatchSITType must have happened first.
    // Returns true or false and also creates an according error object in the SITAnalyzer's error list, if createErrors equals true.  
    // Is used with this parameter set to false when generating suggestions for inconsistently typed features.
    doorFeatureIsOnWallRepresentation(building, doorFeature, createErrors){

        if (!this.nonDoorTypesAnalyzed){
            throw Error("Geometry consistency with SIT tags must be already checked for features which are no doors.")
        }

        // Only input consistently typed doors!
        if (doorFeature.geometry.type !== "Point"){
            throw Error("Inputted feature has wrong geometry, must be a point.");
        }

        // List of levels given by the door's "level" or "repeat_on" tag.
        var parsedFeatureLevels = getLevelsAsNumbers(doorFeature, true);
        var levels = parsedFeatureLevels.levels;

        // Return -1, if the feature has no valid "level" or "repeat_on" tag. 
        if (levels === false || levels === -1){
            return -1;
        }

        // List of levels where the feature has a single-level door with no underlying wall.
        var noWallLevels = [];
        // Boolean to indicate whether walls are missing for levels where the feature has a multi-level door.
        var noMultiLevelWallMissing = true;

        // Door feature uses the level tag.
        // If repeat_on also exists, still the level tag is analyzed. Both existing is another error covered elsewhere.
        if (parsedFeatureLevels.origin === "level"){
           
            // Analysis of all given levels: Treat successive levels as multi-leveled door, others as repeating door.
            // => repeat_on will be suggested if there are missing levels inbetween ("level" is only for multi-leveled objects)
            for (let i = 0; i < levels.length; i++){
                var lastLevel = levels[i];
                var oneDoorLevels = [ lastLevel ];
                i += 1;
                while (levels[i] === lastLevel || parseInt(levels[i]) === parseInt(lastLevel) + 1){
                    if (levels[i] === lastLevel){
                        i += 1;
                    }
                    else {
                        oneDoorLevels.push(levels[i]);
                        lastLevel = levels[i];
                        i += 1;
                    }
                }
                i -= 1;
                if (oneDoorLevels.length > 1){
                    noMultiLevelWallMissing = noMultiLevelWallMissing && this.isMultiLevelDoorOnValidWallRepresentation(building, doorFeature, levels, createErrors);
                }
                else {
                    if (!this.doorOnLevelIsOnWallRepresentation(building, doorFeature, oneDoorLevels[0])){
                        noWallLevels.push(oneDoorLevels[0]);
                    }
                }
            }
            
        }

        // Door feature uses the repeat_on tag.
        // Every level given by the tag should provide a wall representation for a single-leveled door on the feature's position.
        else if (parsedFeatureLevels.origin === "repeat_on"){
            
            // Make sure erroneous multiples of levels don't lead to repeated analysis.
            let checkedLevels = [];

            // Check if the level provides a wall representation for the door.
            for (const l of levels){
                if (!checkedLevels.includes(l)){
                    if (!this.doorOnLevelIsOnWallRepresentation(building, doorFeature, l)){
                        noWallLevels.push(l);
                    }
                    checkedLevels.push(l);
                }
            }
        }

        // Error: Wall representations for single-level doors are missing. Provides levels on which representations are missing.
        // Return false because wall representations are missing.
        if (noWallLevels.length > 0){
            if (createErrors){
                this.doorNoWallErrors.push(makeErrorObj("DOORNOWALL-1", [doorFeature.id, noWallLevels], [1]));
                this.nonConformObjects.add(doorFeature.id);
            }
            return false;
        }
        // No single-level doors are missing.
        // => Return true, if no multi-level wall representations are missing, otherwise false.
        // According errors are not created here, but in isMultiLevelDoorOnValidWallRepresentation
        else { 
            return noMultiLevelWallMissing;
        }
    }

    // Check if the features in the given level (in building) provide a wall representation for the single-leveled doorFeature.
    // Returns true or false.
    //
    // A wall representation can be provided by a level feature outline, if there is any, or by a building outline otherwise.
    // If the door is situated on neither of those, rooms and walls are checked.
    doorOnLevelIsOnWallRepresentation(building, doorFeature, level){
        
        // Get existing level outlines for this level & check if door is situated on them.
        // (Multiple should not exist, but if so, all are checked.)
        var levelHasLevelOutline = false;
        for (const l of this.correctSITTypeObjects.levels){
            let levels = getLevelsAsNumbers(l);
            if (levels !== false && levels !== -1){
                for (const levelVal of levels){
                    if (levelVal === level){
                        if (window.vectorDataManager.isOnContour(l, doorFeature)){
                            return true;
                        }
                        levelHasLevelOutline = true;
                    }
                }
            }
        }

        // If level has no level outline, check if the door is situated on the building's outline.
        if (!levelHasLevelOutline){
            if (window.vectorDataManager.isOnContour(building, doorFeature)){
                return true;
            }
        } 

        // Get existing room outlines for this level & check if door is situated on them.
        for (const r of this.correctSITTypeObjects.rooms){
            let levels = getLevelsAsNumbers(r);
            if (levels !== false && levels !== -1){
                if (levels.includes(level)){
                    if (window.vectorDataManager.isOnContour(r, doorFeature)){
                        return true;
                    }
                }
            }
        }

        // Get existing walls for this level & check if door is situated on them.
        for (const w of this.correctSITTypeObjects.walls){
            let levels = getLevelsAsNumbers(w);
            if (levels !== false && levels !== -1){
                if (levels.includes(level)){
                    if (booleanPointOnLine(doorFeature.geometry, w)){
                        return true;
                    }
                }
            }
        }

        return false;
    }

    // Checks if a multi-level door is on a valid, i.e. continous, wall representation in the given level range (param levels) and building.
    // A multi-level door should be situated on continous wall representations because a multi-level door should only
    // connect multi-level rooms / m.-l. corridors / m.-l. areas. 
    // Continous wall representations are: 
    //      -> building walls: building / level outline on each level
    //      -> multi-level rooms
    //      -> multi-leveled wall
    //
    // Creates according error objects and stores them in the SITAnlyzer's doorMultiLevelErrors list.
    isMultiLevelDoorOnValidWallRepresentation(building, door, levels, createErrors){

        // Check all rooms in the given level range.
        for (const r of this.correctSITTypeObjects.rooms){
            var roomLevels = getLevelsAsNumbers(r);

            if (roomLevels !== false && roomLevels !== -1){

                // Check if room is situated in the given level range.
                var roomIsPartOfLevels = false;
                for (const l of levels){
                    if (roomLevels.includes(l)){
                        roomIsPartOfLevels = true;
                        break;
                    }
                }

                // If room is in the given level range, check if door is on its outline.
                // If so, the room should be a multi-level room on all of the door's levels. Otherwise, an error is generated.
                // The error provides the door's id, the room's id and both the levels on which the door is on the room and the ones where it's not. 
                if (roomIsPartOfLevels){

                    if (window.vectorDataManager.isOnContour(r, door)){
                        
                        var notOnRoomLevels = [];
                        var onRoomLevels = [];
                        for (const l of levels){
                            roomLevels.includes(l) ? onRoomLevels.push(l) : notOnRoomLevels.push(l);
                        
                        }

                        if (notOnRoomLevels.length > 0){
                            if (createErrors){
                                this.doorMultiLevelErrors.push(makeErrorObj("MULTILVLDOOR-1", [door.id, "room", r.id, onRoomLevels, notOnRoomLevels], [3, 4]));
                                this.nonConformObjects.add(door.id);
                            }
                            return false;
                        }

                        // Set flag for door being on a room's wall.
                        var situatedOnRoomBorders = true;
                    }
                }
            }
        }

        // Multi-level door is on multi-level continous walls when it's situated on continous walls of some multi-level rooms and
        // not only partly situated on some (multi-level) room's borders. Therefore, when all relevant rooms are checked, and 'return false'
        // in the previous didn't occur (obviously, if the program gets here), one can return true.
        if (situatedOnRoomBorders === true){
            return true;
        }

        // Check all walls in the given level range.
        for (const w of this.correctSITTypeObjects.walls){
            var wallLevels = getLevelsAsNumbers(w);
            // Check if wall is part of the given level range.
            if (wallLevels !== false && wallLevels !== -1){
                var wallIsPartOfLevels = false;
                for (const l of levels){
                    if (wallLevels.includes(l)){
                        wallIsPartOfLevels = true;
                        break;
                    }
                }
                if (wallIsPartOfLevels){

                    // If wall is in the given level range, check if door is on its way.
                    // If so, the wall should be a multi-level wall on all of the door's levels. Otherwise, an error is generated.
                    // The error provides the door's id, the wall's id and both the levels on which the door is on the wall and the ones where it's not. 
                    if (booleanPointOnLine(door.geometry, w)){
                            
                        var notOnWallLevels = [];
                        var onWallLevels = [];
                        for (const l of levels){
                            wallLevels.includes(l) ? onWallLevels.push(l) : notOnWallLevels.push(l);
                        }
                            
                        if (notOnWallLevels.length > 0){
                            if (createErrors){
                                this.doorMultiLevelErrors.push(makeErrorObj("MULTILVLDOOR-1", [door.id, "wall", w.id, onWallLevels, notOnWallLevels], [3, 4]));
                                this.nonConformObjects.add(door.id);
                            }
                            return false;
                        }

                        // Set the flag for door being on a wall.
                        var situatedOnWallBorders = true;
                    }
                }
            }
        }

        // Multi-level door is on multi-level continous walls when it's situated on some multi-level wall features and
        // not only partly situated on some (multi-level) wall features. Therefore, when all relevant walls are checked, and 'return false'
        // in the previous didn't occur (obviously, if the program gets here), one can return true.
        if (situatedOnWallBorders === true){
            return true;
        }

        // Check level outlines / building outline in the given level range.
        // If the door is situated on neither, i.e. it isn't situated on any wall representation, creates an error providing the levels on which it is not.
        if (situatedOnRoomBorders === undefined && situatedOnWallBorders === undefined){
            
            var noBuildingWallLevels = [];
            
            // Iterate over all levels of the given level range to check if the door is on any level or building outline.
            for (const l of levels){
                var levelHasLevelOutline = false;
                var isOnAnyLevelOutline = false;

                // Iterate over all level features.
                // Check if level outline exists for a level and if door is situated on it.
                for (const lObj of this.correctSITTypeObjects.levels){
                    var lObjLevels = getLevelsAsNumbers(lObj);
                    if (lObjLevels !== false && lObjLevels !== -1){
                        if (lObjLevels.includes(l)){
                            levelHasLevelOutline = true;
                            isOnAnyLevelOutline = true;
                        }
                    }
                }

                // Only check building outline if no level outline exists for a level.
                if (!levelHasLevelOutline){
                    if(!window.vectorDataManager.isOnContour(building, door)){
                        noBuildingWallLevels.push(l);
                    }
                }
                // Save level for error, when level features exist and the door is on none of them.
                else {
                    if (!isOnAnyLevelOutline){
                        noBuildingWallLevels.push(l);
                    }
                }
            }

            if (noBuildingWallLevels.length > 0){
                if (createErrors){
                    this.doorMultiLevelErrors.push(makeErrorObj("MULTILVLDOOR-2", [door.id, noBuildingWallLevels], [1]));
                    this.nonConformObjects.add(door.id);
                }
                return false;
            }
            else {
                return true;
            }
        }
    }
}

export {SITAnalyzer};
