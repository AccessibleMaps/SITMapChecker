/*
 * This file is part of OsmInEdit, released under ISC license (see LICENSE.md)
 *
 * Copyright (c) Adrien Pavie 2019
 * Copyright (c) Daimler AG 2019
 *
 * Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 */

import 'array-flat-polyfill';
import L from 'leaflet';
import { Path, withLeaflet } from 'react-leaflet';
import 'leaflet-editable';
import 'leaflet-draw';
import './leaflet.snap';
import 'leaflet-geometryutil';
import 'leaflet-textpath';
import 'leaflet-polylinedecorator';
import area from '@turf/area';
import deepEqual from 'fast-deep-equal';
import GeoJSONValidation from 'geojson-validation';
import Mousetrap from 'mousetrap';
import pointOnFeature from '@turf/point-on-feature';
import pointToLineDistance from '@turf/point-to-line-distance';
import PubSub from 'pubsub-js';

const GEOJSON_PRECISION = 8;
const GUIDE_LINES_ANGLE_KEY = "a";
const ICON_SIZE = 20;
const CONVEYING_TO_IMG = { "yes": "fwd", "forward": "fwd", "backward": "bwd", "reversible": "both" };

// Default styles
const stShadow = { color: "purple", fillColor: "black", opacity: 0.5, fillOpacity: 0.2, zIndex: -10 };
const existingIcons = {};


// Fix for excluding selected geometry from snapping guides
const MyMarkerSnap = L.Handler.MarkerSnap.extend({
	removeGuideGeoJSON: function(geom) {
		var index = this._guides.findIndex(function(guideLayer) {
			if(!guideLayer.toGeoJSON) { return false; }
			else {
				const gj = guideLayer.toGeoJSON(GEOJSON_PRECISION);
				return (gj.type === "Feature" && deepEqual(gj.geometry, geom)) || (gj.type === "FeatureCollection" && gj.features.length === 1 && deepEqual(gj.features[0].geometry, geom));
			}
		});

		if (index !== -1) {
			this._guides.splice(index, 1);
		}
	}
});

// Fix for limiting tolerance around marker click
const MyCircleMarker = L.CircleMarker.extend({
	_containsPoint: function (p) {
		return p.distanceTo(this._point) <= this._radius;
	}
});

// Icon handling load errors
const MyIcon = L.Icon.extend({
	_createImg: function (src, el) {
		el = el || document.createElement('img');
		el.src = src;
		el.onerror = () => {
			window.UNUSABLE_ICONS.add(el.src);
			el.style.display='none';
		};
		return el;
	}
});


/**
 * Editable layer is an extension of GeoJSON layer in order to manage editing of geometries.
 * Editing is handled by leaflet-editable extension. The role of this class is to make React work nicely with this extension.
 *
 * @property {function} [onFeatureClick] Handler for click on one feature, one parameter is given : the GeoJSON feature which was clicked
 * @property {Object} [shadowData] GeoJSON features which are shown in background but you cannot interact with
 * @property {Object} [selection] GeoJSON feature which should be shown as selected at start
 * @property {MapStyler} [styler] The map styler
 */
class EditableLayer extends Path {
	/** Drawing polygon **/
	static DRAW_POLYGON = 1;
	/** Drawing marker **/
	static DRAW_MARKER = 2;
	/** Drawing line **/
	static DRAW_LINE = 3;

	/** Matching between preset types and drawing types **/
	static PRESET_TO_DRAW = { "node": EditableLayer.DRAW_MARKER, "way": EditableLayer.DRAW_LINE, "closedway": EditableLayer.DRAW_POLYGON };

	createLeafletElement(props) {
		// Add some defaults
		const thatStyler = props.styler.getFeatureStyle.bind(props.styler);
		const myprops = Object.assign({}, {
			pointToLayer: (feature, latlng) => {
				const marker = new MyCircleMarker(latlng, thatStyler(feature));
				marker.on("click", () => props.onFeatureClick(feature));
				return marker;
			},
			onFeatureClick: (() => {}),
			style: thatStyler,
			onEachFeature: (f, l) => {
				if(l instanceof L.Polyline && !(l instanceof L.Polygon)) {
					this._setLayerStyle(l, props, false, true);
				}
			}
		}, props);

		// Create snap handler
		this._createSnapHandler(props.leaflet.map);

		// Create the GeoJSON layer
		const lGeojson = this._populateLayer(new L.GeoJSON(null, this.getOptions(myprops)), myprops);

		return lGeojson;
	}

	componentDidMount() {
		super.componentDidMount();
		const map = this.props.leaflet.map;

		/*
		 * Bind various events for whole layer lifetime
		 */

		// Call for forcing complete layer redraw
		PubSub.subscribe("map.editablelayer.redraw", (msg, data) => {
			this.updateLeafletElement({}, this.props);
		});

		// Disable mouseover event when dragging a vertex
		map.on("editable:vertex:dragstart", e => {
			this.leafletElement.eachLayer(l => l.off("mouseover"));
			this._snapFollowMarker(e.vertex);

			// Hide direction icons for line if any
			if(
				this._linesDirIcons
				&& e.layer && e.layer.feature && e.layer.feature.id
				&& this._linesDirIcons[e.layer.feature.id]
				&& map.hasLayer(this._linesDirIcons[e.layer.feature.id])
			) {
				map.removeLayer(this._linesDirIcons[e.layer.feature.id]);
				delete this._linesDirIcons[e.layer.feature.id];
			}

			// Hide cursor move
			if(this._markerMove) {
				this._markerMove.setOpacity(0);
			}
		});

		// Save new geometry when vertex is released
		map.on("editable:vertex:dragend", e => {
			this.snap.unwatchMarker(e.vertex);
			PubSub.publish("body.edit.feature", { feature: e.layer.toGeoJSON(GEOJSON_PRECISION) });
		});

		// Click on a node vertex (for selection)
		if(this.props.allowVertexClick) {
			map.on("editable:vertex:rawclick", e => {
				const node = window.vectorDataManager.findNodeFeature(e.latlng);

				// If node is a feature, select it
				if(node && (!node.properties.own || !node.properties.own.utilityNode)) {
					PubSub.publish("body.select.feature", { feature: node });
					e.cancel();
				}
			});
		}

		// Click on a node vertex (for deletion)
		map.on("editable:vertex:deleted", e => {
			PubSub.publish("body.edit.feature", { feature: e.layer.toGeoJSON(GEOJSON_PRECISION) });
		});

		// When user starts creating new feature
		map.on("editable:drawing:start", e => {
			map.on("mousemove", this._followMouse, this);
		});

		// When user click to add a vertex on a new feature
		map.on("editable:drawing:click", e => {
			const latlng = this.snapMarker.getLatLng();
			e.latlng.lat = latlng.lat;
			e.latlng.lng = latlng.lng;
		});


		// Force update to make sure everything is set up correctly
		PubSub.publishSync("map.editablelayer.redraw");
	}

	componentWillUnmount() {
		super.componentWillUnmount();

		// Clean up all bind events
		const map = this.props.leaflet.map;
		PubSub.unsubscribe("map.editablelayer.redraw");
		map.off("editable:vertex:dragstart");
		map.off("editable:vertex:dragend");
		map.off("editable:vertex:rawclick");
		map.off("editable:vertex:deleted");
		map.off("editable:drawing:start");
		map.off("editable:drawing:end");
		map.off("editable:drawing:click");
		map.off("mousemove");

		if(this.snapMarker) {
			this.snapMarker.off("snap");
			this.snapMarker.off("unsnap");
		}

		this._cleanLinesDirIcons(this.props.leaflet.map);
		this.updateLeafletElement(this.props, { leaflet: this.props.leaflet });
	}

	updateLeafletElement(fromProps, toProps) {
		let updateIcons = false;
		let enableSnap = false;
		let disableSnap = false;

		// Add style property according to styler
		if(!toProps.style && toProps.styler) {
			toProps = Object.assign({}, toProps, { style: toProps.styler.getFeatureStyle.bind(toProps.styler) });
		}

		//Style
		if(fromProps.styler !== toProps.styler) {
			this.setStyle(toProps.style);
			updateIcons = true;
		}
		else {
			this.setStyleIfChanged(fromProps, toProps);
		}

		//Data
		if(
			fromProps.data !== toProps.data
			&& !deepEqual(fromProps.data, toProps.data)
		) {
			this.leafletElement.clearLayers();
			if(toProps.data && (fromProps.draw === toProps.draw || !fromProps.draw || toProps.draw)) {
				this._populateLayer(this.leafletElement, toProps);
			}
			updateIcons = true;
		}

		// Start editor if necessary
		if(fromProps.draw !== toProps.draw) {
			if(!fromProps.draw && toProps.draw) {
				enableSnap = true;
				this._startDrawing(toProps);
			}
			else if(fromProps.draw && !toProps.draw) {
				this._stopDrawing(toProps);
				disableSnap = true;
				this.leafletElement.clearLayers();

				if(toProps.data) {
					this._populateLayer(this.leafletElement, toProps);
				}
			}
		}

		// Restore editor
		if(fromProps.selection === toProps.selection && toProps.selection !== null) {
			enableSnap = true;
			this.leafletElement.eachLayer(l => {
				if(l.feature) {
					if(toProps.selection.id === l.feature.id) {
						if(l.enableEdit) {
							l.enableEdit();
						}
					}
				}
			});
		}

		if(fromProps.selection !== toProps.selection) {
			if(!fromProps.selection && toProps.selection) {
				enableSnap = true;
			}

			if(fromProps.selection && !toProps.selection) {
				disableSnap = true;
			}
		}

		// Change selection if updated
		if(fromProps.selection !== toProps.selection) {
			// Remove move cursor from previous selection
			if(this._markerMove && fromProps.selection) {
				this.leafletElement.removeLayer(this._markerMove);

				if(fromProps.selection.id.startsWith("node/")) {
					disableSnap = true;
					this._markerMove.off("moveend mousemove move");
					this.snap.unwatchMarker(this._markerMove);
				}

				delete this._markerMove;
			}

			// Update icons when selection changes
			if(toProps.selection !== fromProps.selection && this._featureIcons) {
				if(fromProps.selection && toProps.data) {
					const f = toProps.data.features.find(d => d.id === fromProps.selection.id);
					if(f) {
						this._addIconForLayer(
							f,
							toProps.styler.getFeatureStyle(f).iconImage
						);
					}
				}

				if(toProps.selection) {
					const iconToRemove = this._featureIcons.getLayers().find(l => l.options && l.options.fid === toProps.selection.id);
					if(iconToRemove) {
						this._featureIcons.removeLayer(iconToRemove);
					}
				}
			}

			// Select against non-nodes features
			if(
				(toProps.selection && (!toProps.selection.id.startsWith("node/") || !toProps.selection.properties.own.utilityNode))
				|| (fromProps.selection && (!fromProps.selection.id.startsWith("node/") || !fromProps.selection.properties.own.utilityNode))
			) {
				let newLayer = null;

				this.leafletElement.eachLayer(l => {
					if(l.feature) {
						if(fromProps.selection && fromProps.selection.id === l.feature.id) {
							this._setLayerStyle(l, toProps, false);

							if(l.disableEdit && l.editEnabled()) {
								l.disableEdit();
							}

							if(this.snap && this.snap.addGuideLayer) {
								this.snap.addGuideLayer(new L.GeoJSON(l.feature.geometry));
							}
						}

						if(toProps.selection && toProps.selection.id === l.feature.id) {
							this._setLayerStyle(l, toProps, true);

							if(l.enableEdit) {
								l.enableEdit();
								newLayer = l;
							}

							if(this.snap && this.snap.removeGuideGeoJSON) {
								this.snap.removeGuideGeoJSON(l.feature.geometry);
							}
						}
					}
				});

				// Allow dragging feature
				if(newLayer && toProps.allowFeatureDrag) {
					let prevpos = null;
					let center = newLayer.getCenter();

					// If geometry is a line, don't put center at center to allow creating middle vertex
					if(newLayer.feature.geometry.type === "LineString") {
						const c1 = newLayer.feature.geometry.coordinates[0];
						const c2 = newLayer.feature.geometry.coordinates[newLayer.feature.geometry.coordinates.length-1];
						center = new L.LatLng(
							(c1[1]*2 + c2[1]) / 3,
							(c1[0]*2 + c2[0]) / 3
						);
					}

					this._markerMove = this._createMarkerMove(center);
					this.leafletElement.addLayer(this._markerMove);

					this._markerMove.on("move", e => {
						// Compute vector movement
						if(!prevpos) { prevpos = e.target.dragging._draggable._startPos; }
						const newpos = e.target.dragging._draggable._newPos;
						const move = newpos.subtract(prevpos);
						prevpos = newpos;

						// Move temporarily the Leaflet layer
						const movell = ll => (
							(ll.lat) ?
								toProps.leaflet.map.layerPointToLatLng(toProps.leaflet.map.latLngToLayerPoint(ll).add(move))
								: ll.map(movell)
						);

						newLayer.setLatLngs(movell(newLayer.getLatLngs()));

						// Hide direction icons if any
						if(
							this._linesDirIcons
							&& newLayer.feature.id
							&& this._linesDirIcons[newLayer.feature.id]
							&& toProps.leaflet.map.hasLayer(this._linesDirIcons[newLayer.feature.id])
						) {
							toProps.leaflet.map.removeLayer(this._linesDirIcons[newLayer.feature.id]);
							delete this._linesDirIcons[newLayer.feature.id];
						}

						// Hide vertex editing
						if(newLayer.disableEdit) {
							newLayer.disableEdit();
						}
					});

					this._markerMove.on("moveend", e => {
						// Make move change permanent
						const newfeature = Object.assign({}, toProps.selection);
						newfeature.geometry = newLayer.toGeoJSON(GEOJSON_PRECISION).geometry;
						PubSub.publish("body.edit.feature", { feature: newfeature });
					});
				}
			}

			// Select against nodes
			if(
				(toProps.selection && toProps.selection.id.startsWith("node/"))
				|| (fromProps.selection && fromProps.selection.id.startsWith("node/"))
			) {
				const newCoords = (toProps.selection && toProps.selection.id.startsWith("node/")) ?
					new L.LatLng(toProps.selection.geometry.coordinates[1], toProps.selection.geometry.coordinates[0])
					: null;

				// Selecting/unselecting a door = update door lines
				if((fromProps.selection && this._isADoorWithWidth(fromProps.selection)) || (toProps.selection && this._isADoorWithWidth(toProps.selection))) {
					this._addDoorLines(this.leafletElement, toProps.leaflet.map);
				}

				// Show marker for moving
				if(toProps.selection && toProps.selection.id.startsWith("node/") && !toProps.selection.properties.own.utilityNode) {
					this._markerMove = this._createMarkerMove(newCoords);
					this.leafletElement.addLayer(this._markerMove);
					enableSnap = this._markerMove;
					let layersConnected = [];

					// Handle case where we're moving routing graph features
					if(toProps.keepRoutingGraphConnected) {
						if(this._isRoutingGraphRelated(toProps.selection)) {
							// Find features we should keep connected
							layersConnected = this.leafletElement
							.getLayers()
							.filter(l => (
								l.feature
// 								&& l.feature.properties.own && l.feature.properties.own.levels && l.feature.properties.own.levels.includes(this.props.level)
								&& this._containsCoordinates(l.feature.geometry, toProps.selection.geometry.coordinates)
							))
							// And keep track of nodes in these lines we should move
							.map(l => {
								return [ l, this._findNodesToUpdate(l, L.GeoJSON.coordsToLatLng(toProps.selection.geometry.coordinates)) ];
							});
						}
					}

					this._markerMove.on("moveend", e => {
						const newfeature = Object.assign({}, toProps.selection);
						newfeature.geometry = this._markerMove.toGeoJSON(GEOJSON_PRECISION).geometry;
						PubSub.publish("body.edit.feature", { feature: newfeature });

						// Also update connected layers if any
						const newll = this._fixLatLng(this._markerMove.getLatLng());
						this._updateConnectedLayers(layersConnected, newll);
						layersConnected.forEach(lc => {
							if(lc[0].feature) {
								const newfeature = Object.assign({}, lc[0].feature);
								newfeature.geometry = lc[0].toGeoJSON(GEOJSON_PRECISION).geometry;
								PubSub.publish("body.edit.feature", { feature: newfeature, select: false });
							}
						});
					});

					// Remove door line if any
					if(toProps.selection && this._isADoorWithWidth(toProps.selection) && this._doorLines) {
						this._markerMove.on("movestart", e => {
							const mylatlng = L.GeoJSON.coordsToLatLng(toProps.selection.geometry.coordinates);
							this._doorLines
							.getLayers()
							.filter(l => (
								l.getLatLngs().find(ll => ll.equals(mylatlng))
							))
							.forEach(l => {
								this._doorLines.removeLayer(l);
							});
						});
					}

					let foundMarker = null;
					this.leafletElement.eachLayer(n => {
						if(n.feature && n.feature.id === toProps.selection.id) {
							foundMarker = n;
						}
					});

					// Sync move between this._markerMove and current feature
					if(foundMarker) {
						this._markerMove.on("mousemove", e => {
							const newll = this._fixLatLng(e.latlng);
							foundMarker.setLatLng(newll);
							this._updateConnectedLayers(layersConnected, newll);
						});
					}
				}
			}
		}

		// Updates on current selection
		if(toProps.selection && fromProps.selection === toProps.selection) {
			// Update door lines when tags are edited
			if(this._isADoorWithWidth(toProps.selection)) {
				this._addDoorLines(this.leafletElement, toProps.leaflet.map);
			}

			if(toProps.selection.geometry.type === "LineString") {
				const l = this.leafletElement.getLayers().find(l => l.feature && l.feature.id === toProps.selection.id);
				if(l) {
					this._setLayerStyle(l, toProps, true, true);
				}
			}
		}

		this._sortFeaturesZIndex(this.leafletElement);

		// Display icons
		if(updateIcons) {
			this._addIcons(this.leafletElement);
		}

		// Enable/disable snapping
		if(enableSnap) {
			this._enableSnapping(toProps.leaflet.map);
			if(typeof enableSnap === "object") {
				this._snapFollowMarker(enableSnap);
			}
		}
		if(disableSnap && !enableSnap) {
			this._disableSnapping();
		}
	}

	/**
	 * Sort features by size and type
	 * @private
	 */
	_sortFeaturesZIndex(layer) {
		// First, polygons
		const polygons = [];
		layer.eachLayer(l => {
			if(l.feature && l instanceof L.Polygon) {
				if(!l.ownArea) {
					l._ownArea = area(l.feature);
				}
				polygons.push(l);
			}
		});

		polygons.sort((a, b) => {
			const zA = a.options && a.options.zIndex && !isNaN(parseInt(a.options.zIndex)) ? parseInt(a.options.zIndex) : 0;
			const zB = b.options && b.options.zIndex && !isNaN(parseInt(b.options.zIndex)) ? parseInt(b.options.zIndex) : 0;
			return zA !== zB ? zB - zA : a._ownArea - b._ownArea;
		});
		polygons.forEach(p => p.bringToBack());

		// Then, lines
		layer.eachLayer(l => {
			if(l.feature && l instanceof L.Polyline && !(l instanceof L.Polygon)) {
				l.bringToFront();
			}
		});

		// Last, nodes
		layer.eachLayer(l => {
			if(l.feature && l.feature.id.startsWith("node/")) {
				l.bringToFront();
			}
		});
	}

	/**
	 * @private
	 */
	_cleanLinesDirIcons(map) {
		if(this._linesDirIcons) {
			Object.values(this._linesDirIcons).forEach(ldl => {
				if(map.hasLayer(ldl)) {
					map.removeLayer(ldl);
				}
			});
			this._linesDirIcons = {};
		}
	}

	/**
	 * Load content into the leaflet layer
	 * @private
	 */
	_populateLayer(layer, props) {
		const map = props.leaflet.map;

		// Clean up linestring icons if any
		this._cleanLinesDirIcons(map);

		/*
		 * Add shadow data
		 */
		if(props.shadowData) {
			const lShadow = new L.GeoJSON(props.shadowData, { style: stShadow });
			lShadow.eachLayer(l => {
				l.own = { shadow: true };
				layer.addLayer(l);
			});
		}

		// Add editable data
		layer.addData(props.data);

		// Display lines for doors with width set
		this._addDoorLines(layer, map);

		// Events specific for each layer
		const guidesForSnap = [];
		layer.eachLayer(l => {
			if((!l.own || !l.own.shadow) && l.enableEdit && l.feature) {
				if(!props.draw) {
					// Handle click
					l.on("click", e => {
						props.onFeatureClick(l.feature);
						this._setLayerStyle(l, props, true);
					});
				}

				// Restore selection
				if(props.selection && props.selection.id === l.feature.id) {
					this._setLayerStyle(l, props, true);
				}
			}

			// Add layer as guide for snapping
			if(l.toGeoJSON && l.feature && (!props.selection || l.feature.id !== props.selection.id)) {
				guidesForSnap.push(new L.GeoJSON(l.feature.geometry));
			}
		});

		// Reload list of layers which should be used as guides for snapping
		this._snapReplaceGuideLayers(guidesForSnap);

		return layer;
	}

	/**
	 * Start editor if draw options is present in props.
	 * @private
	 */
	_startDrawing(props, layer) {
		layer = layer || this.leafletElement;
		if(!this._guideAngleShow) { this._guideAngleShow = false; }

		if(props.draw && layer) {
			const map = props.leaflet.map;

			// Disable click event on features
			layer.eachLayer(l => l.off("click"));

			// Start drawing appropriate type
			if(props.draw === EditableLayer.DRAW_POLYGON) {
				map.editTools.startPolygon();
			}
			else if(props.draw === EditableLayer.DRAW_LINE) {
				map.editTools.startPolyline();
			}
			else if(props.draw === EditableLayer.DRAW_MARKER) {
				map.editTools.startMarker();
			}

			// Show helpers for right angles
			if([EditableLayer.DRAW_LINE, EditableLayer.DRAW_POLYGON].includes(props.draw)) {
				map.on("editable:vertex:new", evt => {
					let coords = evt.layer.getLatLngs();

					if(coords && coords.length > 0 && Array.isArray(coords[0])) {
						coords = coords[0];
					}

					// Create lines
					if(coords && coords.length > 1) {
						// Clear previous guide lines if any
						if(this._guideAngleLines) {
							if(this.snap) {
								this._guideAngleLines.eachLayer(l => this.snap.removeGuideGeoJSON(l.toGeoJSON(GEOJSON_PRECISION)));
							}
							this._guideAngleLines.clearLayers();

							if(map.hasLayer(this._guideAngleLines)) {
								map.removeLayer(this._guideAngleLines);
							}
						}
						else {
							this._guideAngleLines = L.layerGroup();
						}

						// Project coordinates forward and on two sides
						const last1 = coords[coords.length-1];
						const last2 = coords[coords.length-2];
						const angle = L.GeometryUtil.bearing(last1, last2);
						const projDist = 500;

						const extPerp1 = L.GeometryUtil.destination(last1, angle + 90, projDist);
						const extPerp2 = L.GeometryUtil.destination(last1, angle - 90, projDist);
						const extForward = L.GeometryUtil.destination(last1, L.GeometryUtil.bearing(last2, last1), projDist);

						// Create lines and make them visible
						const stGuideAngle = { color: "purple", dashArray: "4", weight: 2, lineCap: "butt" };
						const linePerp = L.polyline([extPerp1, extPerp2], stGuideAngle);
						const lineForward = L.polyline([last1, extForward], stGuideAngle);

						this._guideAngleLines.addLayer(linePerp);
						this._guideAngleLines.addLayer(lineForward);
						this._lastGuideAngleLinesGeojson = [
							linePerp.toGeoJSON(GEOJSON_PRECISION),
							lineForward.toGeoJSON(GEOJSON_PRECISION)
						];

						if(this._guideAngleShow && !map.hasLayer(this._guideAngleLines)) {
							map.addLayer(this._guideAngleLines);
							this._lastGuideAngleLinesGeojson.forEach(l => this.snap.addGuideLayer(new L.GeoJSON(l)));
						}

						Mousetrap.unbind(GUIDE_LINES_ANGLE_KEY);
						Mousetrap.bind(GUIDE_LINES_ANGLE_KEY, () => {
							if(!map.hasLayer(this._guideAngleLines)) {
								map.addLayer(this._guideAngleLines);
								this._lastGuideAngleLinesGeojson.forEach(l => this.snap.addGuideLayer(new L.GeoJSON(l)));
								this._guideAngleShow = true;
							}
							else {
								map.removeLayer(this._guideAngleLines);
								this._lastGuideAngleLinesGeojson.forEach(l => this.snap.removeGuideGeoJSON(l));
								this._guideAngleShow = false;
							}
						}, "keypress");
					}
					else {
						Mousetrap.bind(GUIDE_LINES_ANGLE_KEY, () => {
							this._guideAngleShow = !this._guideAngleShow;
						});
					}
				});
			}

			// Handler when shape is created
			map.on("editable:drawing:end", e => {
				map.removeLayer(e.layer);
				map.off("editable:drawing:end");
				map.off("editable:vertex:new");
				Mousetrap.unbind(GUIDE_LINES_ANGLE_KEY);
				map.off("mousemove", this._followMouse, this);
				this.snapMarker.remove();

				// Check geometry validity
				try {
					const f = e.layer.toGeoJSON(GEOJSON_PRECISION);

					if(GeoJSONValidation.valid(f)) {
						PubSub.publish("body.draw.done", { feature: f });
					}
					else {
						PubSub.publish("body.draw.cancel");
					}
				}
				catch(e) {
					PubSub.publish("body.draw.cancel");
				}
			});
		}
	}

	/**
	 * End current editing
	 * @private
	 */
	_stopDrawing(props) {
		const map = props.leaflet.map;

		// Replace done event to cancel drawing
		map.off("editable:drawing:end");
		map.off("editable:vertex:new");
		Mousetrap.unbind(GUIDE_LINES_ANGLE_KEY);
		map.off("mousemove", this._followMouse, this);
		this.snapMarker.remove();

		map.on("editable:drawing:end", e => {
			map.removeLayer(e.layer);
		});

		// Hide eventual guide layers
		if(this._guideAngleLines && map.hasLayer(this._guideAngleLines)) {
			map.removeLayer(this._guideAngleLines);
		}

		// Stop actual drawing
		map.editTools.stopDrawing();
	}

	/**
	 * @private
	 */
	_followMouse(e) {
		this.snapMarker.setLatLng(e.latlng);
	}

	/**
	 * Create snap handler
	 */
	_createSnapHandler(map) {
		this.snap = new MyMarkerSnap(map, { snapDistance: 20 });

		this.snapMarker = new L.Marker(map.getCenter(), {
			icon: map.editTools.createVertexIcon({className: 'leaflet-div-icon leaflet-drawing-icon'}),
			opacity: 1,
			zIndexOffset: 1000
		});

		// Events
		this.snapMarker.on('snap', e => {
			this.snapMarker.addTo(map);
		});
		this.snapMarker.on('unsnap', e => {
			this.snapMarker.remove();
			map.removeLayer(this.snapMarker);
		});

		this._snapEnabled = false;
	}

	/**
	 * Enable snapping on editing
	 * @private
	 */
	_enableSnapping(map) {
		if(!this._snapEnabled) {
			// Create snapping tools
			this._snapEnabled = true;
			this._snapFollowMarker(this.snapMarker);
		}
	}

	/**
	 * Set the marker to use for snapping
	 * @private
	 */
	_snapFollowMarker(marker) {
		this.snap.enable();
		this.snap._markers = [];
		this.snap.watchMarker(marker);
	}

	/**
	 * Change list of layers to use as guides for snapping
	 * @private
	 */
	_snapReplaceGuideLayers(guides) {
		this.snap._guides = [];
		guides.forEach(g => this.snap.addGuideLayer(g));
	}

	/**
	 * Disable snapping
	 * @private
	 */
	_disableSnapping() {
		if(this._snapEnabled) {
			if(this.snap) {
				this.snap.disable();
			}

			this._snapEnabled = false;
		}
	}

	/**
	 * Is this feature a door with width set ?
	 * @private
	 */
	_isADoorWithWidth(feature) {
		return feature && feature.id && feature.id.startsWith("node/") && feature.properties.tags
			&& (feature.properties.tags.door ||feature.properties.tags.entrance)
			&& feature.properties.tags.width && !isNaN(parseFloat(feature.properties.tags.width))
			&& parseFloat(feature.properties.tags.width) > 0;
	}

	/**
	 * Add the symbol for showing door width
	 * @private
	 */
	_addDoorLines(layer, map) {
		if(this._doorLines && layer.hasLayer(this._doorLines)) {
			layer.removeLayer(this._doorLines);
		}

		this._doorLines = L.layerGroup();

		const doorLayers = layer.getLayers().filter(l => l.getLatLng && this._isADoorWithWidth(l.feature));
		const potentialLayers = layer
			.getLayers()
			.filter(l => l.feature && l.feature.properties.tags && this._isRoomLikeFeature(l.feature))
			.map(l => {
				switch(l.feature.geometry.type) {
					case "LineString":
						l._asLine = l.feature;
						break;
					case "Polygon":
						l._asLine = { type: "Feature", geometry: { type: "LineString", coordinates: l.feature.geometry.coordinates[0] } };
						break;
					default:
						l._asLine = null;
				}

				return l;
			})
			.filter(l => l._asLine);

		doorLayers.forEach(l => {
			const width = parseFloat(l.feature.properties.tags.width);

			if(width > 0) {
				const doorlatlng = l.getLatLng();
				const doorFeature = { type: "Feature", geometry: { type: "Point", coordinates: L.GeoJSON.latLngToCoords(doorlatlng) } };

				let closestLayer = null;
				let closestDistance = null;

				for(let i=0; i < potentialLayers.length; i++) {
					const potentialLayer = potentialLayers[i];
					if(potentialLayer._asLine && potentialLayer.getBounds().contains(doorlatlng)) {
						const dist = pointToLineDistance(doorFeature, potentialLayer._asLine, { unit: "meters" });

						if(dist < 0.1 && (!closestDistance || dist < closestDistance)) {
							closestLayer = potentialLayer;
							closestDistance = dist;
						}
					}
				}

				// Find correct segment
				if(closestLayer) {
					let latlngs = closestLayer.getLatLngs();

					if(latlngs.length > 0) {
						if(!Array.isArray(latlngs[0])) {
							latlngs = [ latlngs ];
						}

						let foundSegment = null;

						for(let r=0; r < latlngs.length; r++) {
							const ring = latlngs[r];
							if(!ring[0].equals(ring[ring.length-1])) {
								ring.push(ring[0]);
							}

							for(let i=0; i < ring.length - 1; i++) {
								if(
									ring[i].equals(doorlatlng) || ring[i+1].equals(doorlatlng)
									|| window.vectorDataManager._isOnLine(ring[i].lng, ring[i].lat, doorlatlng.lng, doorlatlng.lat, ring[i+1].lng, ring[i+1].lat, 1e-6)
								) {
									foundSegment = [ ring[i], ring[i+1] ];

									if(ring[i].equals(doorlatlng)) {
										foundSegment[0] = i > 0 ? ring[i-1] : ring[ring.length-2];
									}
									if(ring[i+1].equals(doorlatlng)) {
										foundSegment[1] = i+2 <= ring.length-1 ? ring[i+2] : ring[1];
									}

									break;
								}
							}

							if(foundSegment) { break; }
						}

						if(foundSegment) {
							const extlatlng1 = L.GeometryUtil.destination(
								doorlatlng,
								L.GeometryUtil.bearing(doorlatlng, foundSegment[0]),
								width / 2
							);
							const extlatlng2 = L.GeometryUtil.destination(
								doorlatlng,
								L.GeometryUtil.bearing(doorlatlng, foundSegment[1]),
								width / 2
							);
							const line = L.polyline([extlatlng1, doorlatlng, extlatlng2], { color: "green", weight: 12, lineCap: "butt" });
							line._isDoorLine = true;
							line.on("click", () => PubSub.publish("body.select.feature", { feature: l.feature }));
							this._doorLines.addLayer(line);
						}
					}
				}
			}
		});

		layer.addLayer(this._doorLines);
	}

	/**
	 * Add icons of features
	 * @private
	 */
	_addIcons(layer) {
		if(this._featureIcons && layer.hasLayer(this._featureIcons)) {
			layer.removeLayer(this._featureIcons);
		}

		this._featureIcons = L.layerGroup();

		const featuresWithIcons = layer.getLayers().filter(l => l.options && l.options.iconImage && (!this.props.selection || l.feature.id !== this.props.selection.id));

		featuresWithIcons.forEach(l => this._addIconForLayer(
			l.feature,
			l.options.iconImage
		));
		layer.addLayer(this._featureIcons);
	}

	/**
	 * Add icon for one specific layer
	 * @private
	 */
	_addIconForLayer(f, iconImage) {
		if(f && iconImage) {
			const iconUrl = window.EDITOR_URL + "img/icons/"+iconImage;

			if(!window.UNUSABLE_ICONS.has(iconUrl)) {
				let icon = existingIcons[iconUrl];

				if(!icon) {
					icon = new MyIcon({
						iconUrl: iconUrl,
						iconSize: [ICON_SIZE, ICON_SIZE],
						iconAnchor: [ICON_SIZE/2, ICON_SIZE/2]
					});
					existingIcons[iconUrl] = icon;
				}

				this._featureIcons.addLayer(new L.marker(L.GeoJSON.coordsToLatLng(pointOnFeature(f).geometry.coordinates), { icon: icon, interactive: false, fid: f.id }));
			}
		}
	}

	/**
	 * Remove overlay texts
	 * @private
	 */
	_removeTexts(layer) {
		document.querySelectorAll('text[clearable=true]').forEach(function(txt){
			txt.parentNode.removeChild(txt);
		})
;
	}

	/**
	 * Change layer style
	 * @private
	 */
	_setLayerStyle(l, props, selected, noSetStyle) {
		const style = props.style || props.styler.getFeatureStyle.bind(props.styler);
		let myStyle;

		if(!noSetStyle) {
			myStyle = style(l.feature, selected);
			l.setStyle(myStyle);
		}

		// Show way direction
		if(l.feature && l.feature.geometry.type === "LineString") {
			const direction = this._getDirection(l.feature);
			const tags = l.feature.properties.tags;

			if(this._linesDirIcons && this._linesDirIcons[l.feature.id] && props.leaflet.map.hasLayer(this._linesDirIcons[l.feature.id])) {
				props.leaflet.map.removeLayer(this._linesDirIcons[l.feature.id]);
			}

			if(tags.incline || tags.conveying || tags.oneway) {
				if(!myStyle) {
					myStyle = style(l.feature, selected) || {};
				}

				l.setText(null);

				if((tags.highway !== "steps" && (tags.incline || tags.conveying)) || (tags.highway === "steps" && tags.incline)) {
					// Find bearing
					let reverse = false;

					try {
						const coords = l.getLatLngs();
						reverse = L.GeometryUtil.bearing(coords[0], coords[coords.length-1]) < 0;
					}
					catch(e) {}

					// Compute icon name
					let iconImage = "direction_";

					let incline = tags.incline ? ((tags.incline === "down" || tags.incline.startsWith("-")) ? "down" : "up") : "front";
					let conveying = CONVEYING_TO_IMG[tags.conveying] ? CONVEYING_TO_IMG[tags.conveying] : "fwd";

					if(reverse && conveying !== "both") { conveying = conveying === "fwd" ? "bwd" : "fwd"; }
					if(
						incline !== "front"
						&& (
							(!reverse && conveying === "bwd")
							|| (reverse && (conveying === "fwd" || conveying === "both"))
						)
					) {
						incline = incline === "up" ? "down" : "up";
					}

					iconImage += incline + "_" + conveying + "_";

					// Gender
					iconImage += parseInt(l.feature.id.slice(-1)) % 2 === 0 ? "m" : "f";
					iconImage += ".png";

					const iconUrl = window.EDITOR_URL + "img/icons/"+iconImage;

					if(!window.UNUSABLE_ICONS.has(iconUrl)) {
						let icon = existingIcons[iconUrl];

						if(!icon) {
							icon = new MyIcon({
								iconUrl: iconUrl,
								iconSize: [28,28],
								iconAnchor: [14,14]
							});
							existingIcons[iconUrl] = icon;
						}

						if(!this._linesDirIcons) {
							this._linesDirIcons = {};
						}

						const polyDec = L.polylineDecorator(
							l,
							{
								patterns: [
									{ offset: 50, repeat: 100, symbol: L.Symbol.marker({rotate: true, angleCorrection: reverse ? 90 : -90, markerOptions: { icon: icon }})}
								]
							}
						);

						this._linesDirIcons[l.feature.id] = polyDec;
						polyDec.addTo(props.leaflet.map);
					}
				}
				else if(tags.oneway) {
					l.setText(
						"   ➡   ",
						{ offset: 5, repeat: true, attributes: { fill: '#333', clearable: true, "font-size": myStyle.width || 15 }, orientation: direction === 1 ? undefined : "flip" }
					);
				}
			}
			else if(selected) {
				l.setText(null);
				l.setText(
					'        ►',
					{ offset: 5, center: true, attributes: { fill: '#333', clearable: true }}
				);
			}
			else {
				l.setText(null);
			}
		}
	}

	/**
	 * Get way direction (-1 = backward, 0 = both ways, 1 = forward)
	 * @private
	 */
	_getDirection(f) {
		if(f.properties && f.properties.tags) {
			if(f.properties.tags.oneway) {
				switch(f.properties.tags.oneway) {
					case "yes":
						return 1;
					case "-1":
						return -1;
					default:
						return 0;
				}
			}
			else if(f.properties.tags.incline) {
				switch(f.properties.tags.incline) {
					case "up":
						return 1;
					case "down":
						return -1;
					default:
						return 0;
				}
			}
		}

		return 0;
	}

	/**
	 * New marker for moving features
	 * @private
	 */
	_createMarkerMove(coords) {
		return new L.Marker(coords, { draggable: true, icon: new L.Icon({ iconUrl: 'img/move.png', iconSize: [32,32], iconAnchor: [16,16]}) });
	}

	/**
	 * Check if an object looks like a wall/room/area
	 * @private
	 */
	_isRoomLikeFeature(feature) {
		const tags = {
			"indoor": "area|room|corridor|wall",
			"highway": "elevator"
		};
		return feature.id && (feature.id.startsWith("way/") || feature.id.startsWith("relation/")) && this._hasTags(feature, tags);
	}

	/**
	 * Check if a feature is a part of the routing graph
	 * @private
	 */
	_isRoutingGraphRelated(feature) {
		const tags = {
			"door": "*",
			"highway": "*",
			"entrance": "*"
		};

		return this._hasTags(feature, tags);
	}

	_hasTags(feature, tags) {
		for(const e of Object.entries(tags)) {
			const [k,v] = e;
			if(
				feature.properties.tags[k] === v
				|| (v === "*" && feature.properties.tags[k] !== undefined)
				|| v.split("|").includes(feature.properties.tags[k])
			) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Does this GeoJSON geometry contains a certain coordinates
	 * @private
	 */
	_containsCoordinates(geom, coords) {
		switch(geom.type) {
			case "Point":
				return deepEqual(geom.coordinates, coords);
			case "LineString":
				return geom.coordinates.findIndex(c => deepEqual(c, coords)) !== -1;
			case "Polygon":
				for(let i=0; i < geom.coordinates.length; i++) {
					if(geom.coordinates[i].findIndex(c => deepEqual(c, coords)) !== -1) {
						return true;
					}
				}
				return false;
			default:
				return false;
		}
	}

	/**
	 * Find which nodes should be updated to follow one vertex
	 * @private
	 */
	_findNodesToUpdate(layer, latlng) {
		let toUpdate = null;

		if(layer.getLatLngs) {
			const latlngs = layer.getLatLngs();

			// Simple array
			if(latlngs[0].lat) {
				toUpdate = [];
				latlngs.forEach((c,i) => {
					if(c.lat === latlng.lat && c.lng === latlng.lng) {
						toUpdate.push(i);
					}
				});
			}
			// Nested array
			else {
				toUpdate = {};
				latlngs.forEach((cr,i) => {
					cr.forEach((c,j) => {
						if(c.lat === latlng.lat && c.lng === latlng.lng) {
							if(!toUpdate[i]) { toUpdate[i] = []; }
							toUpdate[i].push(j);
						}
					});
				});
			}
		}
		else {
			toUpdate = layer.getLatLng().equals(latlng);
		}

		return toUpdate;
	}

	/**
	 * Change coordinates in connected layers
	 * @private
	 */
	_updateConnectedLayers(layersConnected, newll) {
		layersConnected.forEach(lc => {
			if(lc[0].setLatLngs) {
				const newlatlngs = lc[0].getLatLngs();

				if(Array.isArray(lc[1])) {
					lc[1].forEach(tu => { newlatlngs[tu] = newll; });
				}
				else {
					Object.entries(lc[1]).forEach(e => {
						e[1].forEach(tu => { newlatlngs[e[0]][tu] = newll; });
					});
				}

				lc[0].setLatLngs(newlatlngs);
			}
			else if(lc[0].setLatLng && lc[1] === true) {
				lc[0].setLatLng(newll);
			}
		});
	}

	/**
	 * Set coordinates precision of LatLng
	 * @private
	 */
	_fixLatLng(ll) {
		return new L.LatLng(ll.lat.toFixed(GEOJSON_PRECISION), ll.lng.toFixed(GEOJSON_PRECISION));
	}
}

export default withLeaflet(EditableLayer);
