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

import React, { Component } from 'react';
import BuildingEdit from './panes/BuildingEdit';
import Changeset from './panes/Changeset';
import FeatureCreate from './panes/features/Create';
import FeatureEdit from './panes/features/Edit';
import FeatureView from './panes/features/View';
import FloorImagery from './panes/FloorImagery';
import LevelsEditAll from './panes/levels/EditAll';
import LevelsEditOne from './panes/levels/EditOne';

/**
 * Left panel component handles everything being on the left of the map.
 * It manages mainly places search, various feature editing.
 */
class LeftPanel extends Component {
	/** ID for building edit pane **/
	static PANE_BUILDING_EDIT = 1;

	/** ID for adding new levels contour pane **/
	static PANE_LEVELS_ADD = 2;

	/** ID for all levels edit pane **/
	static PANE_LEVELS_EDIT = 3;

	/** ID for new feature pane **/
	static PANE_FEATURE_ADD = 4;

	/** ID for feature edit pane **/
	static PANE_FEATURE_EDIT = 5;

	/** ID for feature view pane **/
	static PANE_FEATURE_VIEW = 6;

	/** ID for review changeset pane **/
	static PANE_CHANGESET = 7;

	/** ID for floor imagery pane **/
	static PANE_FLOOR_IMAGERY = 8;

	render() {
		let component;

		switch(this.props.pane) {
			case LeftPanel.PANE_BUILDING_EDIT:
				component = <BuildingEdit {...this.props} />;
				break;

			case LeftPanel.PANE_LEVELS_ADD:
				component = <LevelsEditAll {...this.props} />;
				break;

			case LeftPanel.PANE_LEVELS_EDIT:
				component = <LevelsEditOne {...this.props} />;
				break;

			case LeftPanel.PANE_FEATURE_ADD:
				component = <FeatureCreate {...this.props} />;
				break;

			case LeftPanel.PANE_FEATURE_EDIT:
				component = <FeatureEdit {...this.props} />;
				break;

			case LeftPanel.PANE_FEATURE_VIEW:
				component = <FeatureView {...this.props} />;
				break;

			case LeftPanel.PANE_CHANGESET:
				component = <Changeset {...this.props} />;
				break;

			case LeftPanel.PANE_FLOOR_IMAGERY:
				component = <FloorImagery {...this.props} />;
				break;

			default:
				component = <div></div>;
		}

		return component;
	}
}

export default LeftPanel;
