
import lineIntersect from '@turf/line-intersect';
import * as turfHelpers from '@turf/helpers';
import {boolPointsEqual} from '../utils_own';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import booleanPointOnLine from "@turf/boolean-point-on-line";

// Checks for the following self intersections of a way and returns true, if the object intersects itself, otherwise false.
// (1) INTERSECT-1: Two segments of the way intersect each other at a point which is not a node of both.
// (2) Two segments of the way intersect each other at a point which is a node of both.
//          - No intersection: start point of way == end point of way
//          - INTERSECT-1: The start points of the two segments of the way are identical, i.e. the way crosses the node.
//          - INTERSECT-1 covers identical end points because this would require an occurence of INTERSECT-1 at another point of the way.
//          - INTERSECT-3: Two line segments lay on top of each other.
//          - INTERSECT-2: Double coords: Two successive coords of the way have identical positions.
function waySelfIntersections(coords){

    if (!(coords.length > 1 && coords[0].length === 2 && typeof coords[0][0] === "number")){
        throw Error("Wrong input, must be array of coordinate pairs.");
    }

    // array to note points for which an INTERSECT-3 error already exists
    var error1points = []; 
    var error3pointPairs = [];
    var doubleNodes = [];

    /* comparison of line segments */
    // first line segment loop 
    for (var line1Idx = 0; line1Idx < coords.length - 2; line1Idx++){
        // points of first line segment
        var lineSeg1Start = coords[line1Idx];
        var lineSeg1End = coords[line1Idx + 1];

        // second line segment loop
        for (var line2Idx = line1Idx + 1; line2Idx < coords.length - 1; line2Idx++){
            // points of second line segment
            var lineSeg2Start = coords[line2Idx];
            var lineSeg2End = coords[line2Idx + 1];
            
            // INTERSECT-1/2/3: A mutual node is crossed.
            if (boolPointsEqual(lineSeg1Start, lineSeg2Start)){ 
                
                // INTERSECT-2: Double coords
                if (line1Idx === line2Idx - 1){
                    var doubleNodeNoted = false;
                    for (const n of doubleNodes){
                        if (boolPointsEqual(n, lineSeg1Start)){
                            doubleNodeNoted = true;
                            break;
                        }
                    }
                    if (!doubleNodeNoted){
                        doubleNodes.push(lineSeg1Start);
                    }
                }
                
                else {

                    // INTERSECT-3: Two line segments lay on top of each other
                    if (boolPointsEqual(lineSeg1End, lineSeg2End)){
                        let error3ForSegExists = false;
                        for (const pp of error3pointPairs){
                            if ( (boolPointsEqual(pp[0], lineSeg1Start) && boolPointsEqual(pp[1], lineSeg1End)) || (boolPointsEqual(pp[1], lineSeg1Start) && boolPointsEqual(pp[0], lineSeg1End)) ){
                                error3ForSegExists = true;
                                break;
                            }
                        }
                        if (!error3ForSegExists){
                            error3pointPairs.push([lineSeg1Start, lineSeg1End]);
                        }
                    }

                    // INTERSECT-1: True intersection
                    // Without the following if-clause, superposed line segments (INTERSECT-3) in opposite direction would also appear as a true intersection,
                    // if the line string continues after lineSeg2End. 
                    else if (!boolPointsEqual(lineSeg1End, coords[line2Idx - 1])){
                        var pointError1Intersected = false;
                        for (const p of error1points){
                            if (boolPointsEqual(p, lineSeg1Start)){
                                pointError1Intersected = true;
                                break;
                            }
                        }
                        if (!pointError1Intersected){
                            error1points.push(lineSeg1Start);
                        }
                    }
                }     
            }
            
            // 'else if' excludes case implicitely covered by INTERSECT-1 (identical end points) because it's no potentially erroneous case otherwise
            else if (!boolPointsEqual(lineSeg1End, lineSeg2End)) {
                // check if the line segments are linked by a node not checked for yet
                var link1to2 = false;
                var link2to1 = false;
                if (boolPointsEqual(lineSeg1End, lineSeg2Start)){
                    link1to2 = true;
                }
                if (boolPointsEqual(lineSeg2End, lineSeg1Start)){
                    link2to1 = true;
                }
                // INTERSECT-3: Two line segments lay on top of each other.
                if (link1to2 && link2to1){
                    let error3ForSegExists = false;
                    for (const pp of error3pointPairs){
                        if ( (boolPointsEqual(pp[0], lineSeg1Start) && boolPointsEqual(pp[1], lineSeg1End)) || (boolPointsEqual(pp[1], lineSeg1Start) && boolPointsEqual(pp[0], lineSeg1End)) ){
                            error3ForSegExists = true;
                            break;
                        }
                    }
                    if (!error3ForSegExists){
                        error3pointPairs.push([lineSeg1Start, lineSeg1End]);
                    }

                }

                // cases of otherwise linked line segments are excluded because they're not potentially erroneous cases 
                if (!link1to2 && !link2to1){
                    var intersections = lineIntersect(turfHelpers.lineString([lineSeg1Start, lineSeg1End]), turfHelpers.lineString([lineSeg2Start, lineSeg2End])).features;
                    if (intersections.length > 0){
                        if (intersections.length > 1){
                            throw Error("Current line segments have more intersections (> 1) than should be possible for 2 straight lines not on top of each other.");
                        }
                        // INTERSECT-1: Two segments of the way intersect each other at a point which is not a node of both. Make sure that only one error per point is returned.
                        else {
                            pointError1Intersected = false;
                            for (const p of error1points){
                                if (boolPointsEqual(p, intersections[0])){
                                    pointError1Intersected = true;
                                    break;
                                }
                            }
                            if (!pointError1Intersected){
                                error1points.push(intersections[0]);
                            } 
                        }
                    }
                }
            }       
        }
    }

    // Return point pairs of error 3 as strings to enable easier parsing of references by avoiding nested references.
    var error3strings = [];
    for (const pp of error3pointPairs){
        error3strings.push("(" + pp[0][0] + ", " + pp[0][1] + ") & (" + pp[1][0] + ", " + pp[1][1] + ")");
    }

    return [error1points, doubleNodes, error3strings];
}

// Checks for the following intersections of intersectedCoords by intersecting and returns true, if they do intersect, otherwise false.
// Enables dealing h intersectedCoords closed ways which form no actual areas with some segments instead of just checking overlap of potentially overlapping areas.
// INTERSECT-4: The two currently compared line segments of the ways lay on top of each other. 
//              Way1 is intersectedCoords if the end of the successive line segment of intersecting lays in  intersectedCoords polygon and the start of the previous 
//              line segment of intersecting does not; or vice versa.
// INTERSECT-5: The two currently compared line segments of the ways intersect at a point which is not a node of both.
// INTERSECT-6: The two currently compared line segments of the ways have the same end point. If the end point of the successive line segment of intersecting lies on the other side
// of the way formed by the current and successive line segments of intersectedCoords, ntersectedCoords is eed intersectedCoords. 
// INTERSECT-6 also covers this case from the perspective of the two successive line segments having the same start point.
// INTERSECT-7: Way2 ersects intersectedCoords at a point that's only a node of intersectedCoords. Also checks if this node is an end node to prevent noting an intersection twice, if it's actually done.
//              The end point of the successive line segment of the intersecting way needs to lay on the other side of  intersectedCoords way.
// INTERSECT-8: INTERSECT-7, but vice versa.
function boolClosedWayIntersected(intersectedCoords, intersectingCoords){
        
    if (!(intersectedCoords.length > 1 && intersectedCoords[0].length === 2 && typeof intersectedCoords[0][0] === "number")){
        throw Error("Wrong input 1, must be array of coordinate pairs.");
    }
    if (!(intersectingCoords.length > 1 && intersectingCoords[0].length === 2 && typeof intersectingCoords[0][0] === "number")){
        throw Error("Wrong input 2, must be array of coordinate pairs.");
    }

    if (boolPointsEqual(intersectingCoords[0], intersectingCoords[intersectingCoords.length - 1])){
        var intersectingIsClosed = true;
    }
    else {
        intersectingIsClosed = false;
    }

    // loop for line segments of intersectedCoords
    for (var nodes1Idx = 0; nodes1Idx < intersectedCoords.length - 1; nodes1Idx++){
        var lineSeg1Start = intersectedCoords[nodes1Idx];
        var lineSeg1End = intersectedCoords[nodes1Idx + 1];

        // loop for line segments of intersecting
        for (var nodes2Idx = 0; nodes2Idx < intersectingCoords.length - 1; nodes2Idx++){
            var lineSeg2Start = intersectingCoords[nodes2Idx];
            var lineSeg2End = intersectingCoords[nodes2Idx + 1];

            // A successive segment of intersecting only exists when the current one is not the last segment of a non-closed way
            let nextLineSeg2End = null;
            if (intersectingIsClosed || nodes2Idx < intersectingCoords.length - 2){
                nextLineSeg2End = intersectingCoords[forwardSkipStartNodeIdx(nodes2Idx + 2, intersectingCoords.length)];
            }

            var intersections = lineIntersect(turfHelpers.lineString([lineSeg1Start, lineSeg1End]), turfHelpers.lineString([lineSeg2Start, lineSeg2End])).features;

            if (intersections.length > 1){
                throw Error("More intersections than should be possible between two line segments.");
            }

            // INTERSECT-4 (checks as described in comments above function)
            else if ((boolPointsEqual(lineSeg1Start, lineSeg2Start) && boolPointsEqual(lineSeg1End, lineSeg2End)) || (boolPointsEqual(lineSeg1Start, lineSeg2End) && boolPointsEqual(lineSeg1End, lineSeg2Start))){
                let prevLineSeg2Start = null;
                if (intersectingIsClosed || nodes2Idx > 0){
                    prevLineSeg2Start = intersectingCoords[backwardSkipEndNodeIdx(nodes2Idx - 1, intersectingCoords.length)];
                }
                if (nextLineSeg2End !== null && prevLineSeg2Start !== null){
                    let startPoint = turfHelpers.point(prevLineSeg2Start);
                    let endPoint = turfHelpers.point(nextLineSeg2End);
                    let polygon = turfHelpers.polygon([intersectedCoords]);
                    if ( ( (booleanPointInPolygon(endPoint, polygon) && !booleanPointOnPolygonBoundary(endPoint, polygon)) && (!booleanPointInPolygon(startPoint, polygon) && !booleanPointOnPolygonBoundary(startPoint, polygon)) )  || 
                         ( (!booleanPointInPolygon(endPoint, polygon) && !booleanPointOnPolygonBoundary(endPoint, polygon)) && (booleanPointInPolygon(startPoint, polygon) && !booleanPointOnPolygonBoundary(startPoint, polygon)) ) ){
                        return true;
                    }
                }
            }

            else if (intersections.length === 1){
                var intersectIsNodeOfLineSeg1 = boolPointsEqual(intersections[0].geometry.coordinates, lineSeg1Start) || boolPointsEqual(intersections[0].geometry.coordinates, lineSeg1End);
                var intersectIsNodeOfLineSeg2 = boolPointsEqual(intersections[0].geometry.coordinates, lineSeg2Start) || boolPointsEqual(intersections[0].geometry.coordinates, lineSeg2End);

                // INTERSECT-5 (checks as described in comments above function)
                if (!intersectIsNodeOfLineSeg1 && !intersectIsNodeOfLineSeg2){
                    return true;
                }

                else{
                    // INTERSECT-6 (checks as described in comments above function)
                    if (intersectIsNodeOfLineSeg1 && intersectIsNodeOfLineSeg2){
                        if (boolPointsEqual(lineSeg1End, lineSeg2End)){
                            if (nextLineSeg2End !== null){
                                let result = twoSegmentsIntersectionError([lineSeg1Start, lineSeg1End, intersectedCoords[forwardSkipStartNodeIdx(nodes1Idx + 2, intersectedCoords.length)]], lineSeg2Start, nextLineSeg2End);
                                if (result[0]){
                                    return true;
                                }
                            }
                        }
                    }
                    // INTERSECT-7 (checks as described in comments above function)
                    else if (intersectIsNodeOfLineSeg1 && !intersectIsNodeOfLineSeg2 && boolPointsEqual(intersections[0].geometry.coordinates, lineSeg1End)){
                        let result = twoSegmentsIntersectionError([lineSeg1Start, lineSeg1End, intersectedCoords[forwardSkipStartNodeIdx(nodes1Idx + 2, intersectedCoords.length)]], lineSeg2Start, lineSeg2End);
                        if (result[0]){
                            return true;   
                        }
                    }
                    // INTERSECT-8 (checks as described in comments above function)
                    else if (!intersectIsNodeOfLineSeg1 && intersectIsNodeOfLineSeg2 && boolPointsEqual(intersections[0].geometry.coordinates, lineSeg2End)){
                        if (nextLineSeg2End !== null){
                            let result = twoSegmentsIntersectionError([lineSeg2Start, lineSeg2End, nextLineSeg2End], lineSeg1Start, lineSeg1End);
                            if (result[0]){
                                return true;
                            }
                        }
                    }
                }
            }

            else {
                let startPoint = turfHelpers.point(lineSeg2Start);
                let endPoint = turfHelpers.point(lineSeg2End);
                let polygon = turfHelpers.polygon([intersectedCoords]);
                if ( ( (booleanPointInPolygon(endPoint, polygon) && !booleanPointOnPolygonBoundary(endPoint, polygon)) && (!booleanPointInPolygon(startPoint, polygon) && !booleanPointOnPolygonBoundary(startPoint, polygon)) )  || 
                         ( (!booleanPointInPolygon(endPoint, polygon) && !booleanPointOnPolygonBoundary(endPoint, polygon)) && (booleanPointInPolygon(startPoint, polygon) && !booleanPointOnPolygonBoundary(startPoint, polygon)) ) ){
                        return true;
                    }
            }
        }
    }
    return false;
}

// Checks if a given point feature is on the boundary of the given polygon feature.
function booleanPointOnPolygonBoundary(point, polygon){
    for (const lineStringCoords of polygon.geometry.coordinates){
        if (booleanPointOnLine(point, turfHelpers.lineString(lineStringCoords))){
            return false;
        }
    }
    return false;
}

// To be used when adding to a coords index so that the coords.length modulus applies. Without this function, the successive node of the end node would be the start node of 
// a closed way, which is the same as the end node. 
function forwardSkipStartNodeIdx(i, nodesLength){
    if (i !== 0 && i % nodesLength === 0){return 1;}
    else {return i};
}

// To be used when substracting from an coords index so that the coords.length modulus applies. Without this function, the previous node of the start node would be the end node of 
// a closed way, which is the same as the start node. 
function backwardSkipEndNodeIdx(i, nodesLength){
    if (i === -1){ return nodesLength - 2;}
    else {return i;}
}

// Checks, if a way formed by two line segments (threePointsIntersected) is ually intersectedCoords in the 2nd node by two other line segments (intersectingStart, 2nd node, intersectingEnd)
// Returns not only if there's an intersection, but also its position. Currently the position is not used: [boolIntersected, positionCoords]
function twoSegmentsIntersectionError(threePointsIntersected, intersectingStart, intersectingEnd){
    
    // Calculating line equations for the entially intersectedCoords line segments.
    var intersectedSeg1Gradient = (threePointsIntersected[1][1] - threePointsIntersected[0][1]) / (threePointsIntersected[1][0] - threePointsIntersected[0][0]);
    var intersectedSeg1Constant = threePointsIntersected[0][1] - intersectedSeg1Gradient * threePointsIntersected[0][0];
    var intersectedSeg2Gradient = (threePointsIntersected[2][1] - threePointsIntersected[1][1]) / (threePointsIntersected[2][0] - threePointsIntersected[1][0]);
    var intersectedSeg2Constant = threePointsIntersected[1][1] - intersectedSeg2Gradient * threePointsIntersected[1][0];

    // Calculate direction of the first of the entially intersectedCoords line segments.
    if (threePointsIntersected[1][0] - threePointsIntersected[0][0] > 0){
        var initialIntersectedDirection = "positive";
    }
    else {
        initialIntersectedDirection = "negative";
    }

    // First case: The 2nd point of threePointsIntersected is the rightmost / leftmost point
    if ((threePointsIntersected[0][0] <= threePointsIntersected[1][0] && threePointsIntersected[2][0] <= threePointsIntersected[1][0]) 
        || (threePointsIntersected[0][0] >= threePointsIntersected[1][0] && threePointsIntersected[2][0] >= threePointsIntersected[1][0])){
        if (threePointsIntersected[0][1] > threePointsIntersected[2][1]){
            var topGradient = intersectedSeg1Gradient;
            var topConstant = intersectedSeg1Constant;
            var bottomGradient = intersectedSeg2Gradient;
            var bottomConstant = intersectedSeg2Constant;  
        }
        else {
            topGradient = intersectedSeg2Gradient;
            topConstant = intersectedSeg2Constant;
            bottomGradient = intersectedSeg1Gradient;
            bottomConstant = intersectedSeg1Constant; 
        }

        if (initialIntersectedDirection === "positive"){
            var limitSide = "right";
        } 
        else {
            limitSide = "left";
        }

        // Calculating if the potentially intersecting line segments change sides w.r.t. the entially intersectedCoords line segments
        if (isInBetweenXLimitedLines(intersectingStart, topGradient, topConstant, bottomGradient, bottomConstant, threePointsIntersected, limitSide)){
            if (!isInBetweenXLimitedLines(intersectingEnd, topGradient, topConstant, bottomGradient, bottomConstant, threePointsIntersected, limitSide)){
                return [true, threePointsIntersected[1]];
            }
            else {
                return [false];
            }
        }
        else {
            if (isInBetweenXLimitedLines(intersectingEnd, topGradient, topConstant, bottomGradient, bottomConstant, threePointsIntersected, limitSide)){
                return [true, threePointsIntersected[1]];
            }
            else {
                return [false];
            }
        }
    }

    // 2nd case: The 2nd node of the entially intersectedCoords line segments lays between the 1st and 3rd one.
    else {
        if (initialIntersectedDirection === "positive"){
            var startSide = "left";
        }
        else {
            startSide = "right";
        }

        // Calculating if the potentially intersecting line segments change sides w.r.t. the entially intersectedCoords line segments
        if (isBelowXDividedLines(intersectingStart, intersectedSeg1Gradient, intersectedSeg1Constant, intersectedSeg2Gradient, intersectedSeg2Constant, threePointsIntersected[1][0], startSide)){
            if (!isBelowXDividedLines(intersectingEnd, intersectedSeg1Gradient, intersectedSeg1Constant, intersectedSeg2Gradient, intersectedSeg2Constant, threePointsIntersected[1][0], startSide)){
                return [true, threePointsIntersected[1]];
            }
            else {
                return [false];
            }
        }
        else {
            // line segments also stay on one side, if the last point of the potentially intersecting line segments is on the the entially intersectedCoords line segments
            // neccessary because of use of "<" in "isBelowXDividedLines"
            if (booleanPointOnLine(intersectingEnd, turfHelpers.lineString(threePointsIntersected))){
                return [false];
            }
            else if (isBelowXDividedLines(intersectingEnd, intersectedSeg1Gradient, intersectedSeg1Constant, intersectedSeg2Gradient, intersectedSeg2Constant, threePointsIntersected[1][0], startSide)){
                return [true, threePointsIntersected[1]];
            }
            else {
                return [false];
            }
        }
    }
}

// Returns true, if the point given by coords lies between the wedge formed by the given two lines (line equation: gradient * x + constant), which stretches from xlimit in the 
// opposite direction of limitSide. Otherwise returns false.
function isInBetweenXLimitedLines(coords, topGradient, topConstant, bottomGradient, bottomConstant, threePointsIntersected, limitSide){
    if (!(limitSide === "right" || limitSide === "left")){
        throw Error("xlimit side must be 'right' or 'left'");
    }

    var xlimit = threePointsIntersected[1][0];

    if (limitSide === "right"){
        if (coords[0] >= xlimit){
            var isOnLimitSideOfSegs = false;
        }
        else {
            isOnLimitSideOfSegs = true;
        }
    }
    else {
        if (coords[0] <= xlimit){
            isOnLimitSideOfSegs = false;
        }
        else {
            isOnLimitSideOfSegs = true;
        }
    }

    var isTopSegmentPendicular = topGradient === Infinity || topGradient === -Infinity;
    var isBottomSegmentPendicular = bottomGradient === Infinity || bottomGradient === -Infinity;

    // Check if both potentially intersected segments are pendicular.
    if (isTopSegmentPendicular && isBottomSegmentPendicular){
        // same direction => not on top of each other
        if (topGradient === bottomGradient){
            return isOnLimitSideOfSegs
        }
        // opposite directions => on top of each other
        else {
            return booleanPointOnLine(turfHelpers.point(coords), turfHelpers.lineString([threePointsIntersected[0], threePointsIntersected[1]])) || 
                   booleanPointOnLine(turfHelpers.point(coords), turfHelpers.lineString([threePointsIntersected[1], threePointsIntersected[2]]));
        }
    }
    // Check if only top is pendicular.
    else if (isTopSegmentPendicular) {
        return isOnLimitSideOfSegs && coords[1] >= bottomGradient * coords[0] + bottomConstant;
    }
    // Check if only bottom is pendicular.
    else if (isBottomSegmentPendicular){
        return isOnLimitSideOfSegs && coords[1] <= topGradient * coords[0] + topConstant;
    }

    return coords[1] <= topGradient * coords[0] + topConstant && coords[1] >= bottomGradient * coords[0] + bottomConstant;
}

// Returns true, if the point given by coords lies below the given two lines (line equation: gradient * x + constant). One line governs the left side of xdivide, the other
// the right side. Which one is which is given by the startSideParameter.
function isBelowXDividedLines(coords, gradient1, const1, gradient2, const2, xdivide, startSide){
    if (!(startSide === "right" || startSide === "left")){
        throw Error("start side must be 'right' or 'left'");
    }
    
    if (startSide === "right"){
        if (coords[0] >= xdivide){
            return coords[1] < gradient1 * coords[0] + const1;
        }
        else {
            return coords[1] < gradient2 * coords[0] + const2;
        }
    }
    else {
        if (coords[0] >= xdivide){
            return coords[1] < gradient2 * coords[0] + const2;
        }
        else {
            return coords[1] < gradient1 * coords[0] + const1;
        }
    }
}

export {waySelfIntersections, boolClosedWayIntersected};