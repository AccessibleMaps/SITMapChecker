import { Component } from 'react';
import 'leaflet/dist/leaflet.css';
import 'leaflet-hash';
import * as turf from '@turf/turf';
import Map from './Map';


class coverage extends Component {

    getArea(building, level){
		let map = new Map();
		let roomarea =[];
		let levelarea = [];
		let sum = [level.length];
		let sumarea = [level.length];
		let percent = [level.length];
		for (let j = 0; j < level.length; j++){
			//get the level architecture of the building level.length
			let levelFootprints = window.vectorDataManager.getLevelFootprint(building, level[j]);
			let coords;
			let buildinglevel
			//get all coordinates of the level object
		if (levelFootprints.length > 0){
			buildinglevel = levelFootprints[0];
			coords = buildinglevel.geometry.coordinates[0];
		} else {
			coords = building.geometry.coordinates[0];
			buildinglevel = building;
		}
			//console.log(coords);
			//calculate the area of each level individually
		sum[j] = 0;
		for (let i = 0; i < coords.length -1; i++){
			sum[j] += (coords[i][1]+coords[i+1][1])*(coords[i][0]-coords[i+1][0]);
		}
		sum[j] = Math.abs(sum[j]/2)*10000000;

			//get all features from the specific level and filter all rooms, cooridors and areas
		let features = window.vectorDataManager.getFeaturesInLevel(building, level[j]);
		let objecto = map.getObject(features);

		let rooms = [];
		objecto.forEach(function(sitObj){
			let tags = sitObj.gettags();
			let indoor = tags["indoor"];
			let id = sitObj.getid();

			if(indoor === "area" || indoor === "room" || indoor === "corridor"){
				{
				rooms.push(sitObj);
				}
			}
		});
		//put all areas of all rooms in one polypon or Multipolygon
		let room = [];
		let temparea = [];
		if(rooms.length !== 0){
			for(let i = 0; i < rooms.length; i++){
				if(i < 1){
					room[i] = window.vectorDataManager.findFeature(rooms[i].getid());
					temparea[i] = turf.helpers.polygon(room[i].geometry.coordinates);
				}
				else{
					room[i] = window.vectorDataManager.findFeature(rooms[i].getid());
					try {
						temparea[i] = turf.union(temparea[i-1], room[i]);
					}
					catch (e){
						temparea[i] = temparea[i-1];
					}
				}
			}
		roomarea[j] = temparea[rooms.length -1];
		levelarea[j] = turf.difference(buildinglevel, roomarea[j]);
			
		//calculate the area of each room object
		sumarea[j] = 0;
		for (let k = 0; k < roomarea[j].geometry.coordinates.length; k++){
			//get the Array of all coordinates for the object
				let cords;
				switch(roomarea[j].geometry.type){
					case "Polygon":
						cords = roomarea[j].geometry.coordinates[0];
						break;
					case "MultiPolygon":
						cords = roomarea[j].geometry.coordinates[k][0];
						break;
					default:
						break;
				}

        if(!cords) return
			//calculate the area of all rooms
			let roomsum = 0;
				for (let i = 0; i < cords.length -1; i++){
					roomsum += (cords[i][1]+cords[i+1][1])*(cords[i][0]-cords[i+1][0]);
				}
			roomsum = Math.abs(roomsum/2)*10000000;
			//add up all areas of rooms
			sumarea[j] += roomsum;
		}
	}
	else {
			sumarea[j] = 0;
			levelarea[j] = building;
		}
	//calculate the percentage of room coverage for each level
	percent[j] = (sumarea[j]/sum[j])*100;
}

	//calculate the total percentage of room coverage
	let totalarea = 0;
	let totalsum = 0;
	for (let q = 0; q < percent.length; q++){
		totalarea += sumarea[q];
		totalsum += sum[q];
	}
	let totalper = (totalarea/totalsum)*100;
    
    return [percent, totalper, roomarea, levelarea];
    }
    
}
export default coverage;
