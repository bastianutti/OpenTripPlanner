/* This program is free software: you can redistribute it and/or
   modify it under the terms of the GNU Lesser General Public License
   as published by the Free Software Foundation, either version 3 of
   the License, or (at your option) any later version.
   
   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.
   
   You should have received a copy of the GNU General Public License
   along with this program.  If not, see <http://www.gnu.org/licenses/>. 
*/

otp.namespace("otp.planner");

/**
  * Web TripPlanner
  * 
  * otp.planner.Itinerary's purpose is represent a single trip (eg: from point X to point Y).  It contains logic for both
  * parsing the trip XML data into object form, as well as handling events (clicks, etc...) of the trip.  
  *
  * The basic object model is Planner --> TripTab --> Itinerary (with Itinerary being the lowest-level object)
  */

otp.planner.Itinerary = {
    // config
    map            : null,
    locale         : null,
    templates      : null,
    showStopIds    : false,

    // raw data
    xml            : null,
    from           : null,
    to             : null,
    id             : null,
    geoURL         : '',

    lineStyle      : otp.util.OpenLayersUtils.RED_STYLE,

    // stored data
    m_legStore     : null,
    m_fromStore    : null,
    m_toStore      : null,
    m_routes       : null,

    m_startTime    : null,
    m_endTime      : null,

    // geo data
    m_vectors      : null,
    m_markers      : null,
    m_extent       : null,

    // misc
    m_valid        : false,

    /** */
    initialize : function(config)
    {
        otp.configure(this, config);

        this.m_vectors    = new Array();
        this.m_markers    = new Array();

        this.m_legStore   = otp.planner.Utils.makeLegStore();
        this.m_fromStore  = otp.planner.Utils.makeFromStore();
        this.m_toStore    = otp.planner.Utils.makeToStore();
        
        this.load();
    },

    /** */
    load : function()
    {
        this.m_legStore.loadData(this.xml.node);
        this.m_fromStore.loadData(this.xml.node);
        this.m_toStore.loadData(this.xml.node);

        // check for valid load
        this.m_valid = false;
        if(this.m_legStore.getCount() > 0)
        {
            if(this.m_fromStore.getCount() == this.m_toStore.getCount() 
               && this.m_fromStore.getCount() == this.m_legStore.getCount()) {
                this.m_valid = true;
            }
        }

        // get start & end time
        this.makeStartEndTime();

        return this.m_valid;
    },


    /**
     * draws the route vectors on the passed in vector layer 
     * NOTE: will create & cache the vectors from the itinerary, if they are not cached 
     */
    draw : function(vLayer, mLayer)
    {
        if (this.m_vectors.length < 1) {
            this.makeRouteLines();
            this.makeWalkLines();
        }

        if (this.m_markers.length < 1) {
            this.makeMarkers();
        }

        // Reproject layer data for display if necessary
        if (this.map.dataProjection != vLayer.map.getProjection()) {
            for (var i = 0; i < this.m_vectors.length; ++i) {
                if (!this.m_vectors[i].geometry._otp_reprojected) {
                    this.m_vectors[i].geometry._otp_reprojected = true;
                    this.m_vectors[i].geometry.transform(
                            this.map.dataProjection, vLayer.map
                                    .getProjectionObject());
                }
            }
        }

        if (this.map.dataProjection != mLayer.map.getProjection()) {
            for (var i = 0; i < this.m_markers.length; ++i) {
                if (!this.m_markers[i].geometry._otp_reprojected) {
                    this.m_markers[i].geometry._otp_reprojected = true;
                    this.m_markers[i].geometry.transform(
                            this.map.dataProjection, mLayer.map
                                    .getProjectionObject());
                }
            }
        }

        vLayer.addFeatures(this.m_vectors);

        mLayer.addFeatures(this.m_markers);
        this.m_extent = mLayer.getDataExtent();
        this.m_extent.extend(vLayer.getDataExtent());
    },

    /** */
    getRoutes : function()
    {
        return this.m_routes;
    },

    /** */
    getExtent : function()
    {
        return this.m_extent;
    },

    /** */
    getMarkers : function()
    {
        return this.m_markers;
    },

    /**
     * returns route vectors 
     * NOTE: will create & cache the vectors from the itinerary, if they are not already there
     * BUT:  the line might not be there fully if this is the first call to get the vector from AJAX, 
     *       since the route vector may not be completely returned from the async call.
     */
    getVectors : function()
    {
        var retVal = null;

        if (this.m_vectors.length < 1) {
            this.makeRouteLines();
            this.makeWalkLines();
        }
        retVal = this.m_vectors;

        return retVal;
    },


    /**
     * pushes a new vector into the line array
     */
    pushVector : function(vector)
    {
        if(vector != null)
            this.m_vectors.push(vector);
    },

    /**
     *  pushes an array of vectors into the vector array 
     */
    concatVectors : function(vectors)
    {
        if(vectors && vectors.length > 0)
            this.m_vectors = this.m_vectors.concat(vectors);
    },

    /** */
    getFrom : function()
    {
        return this.from;
    },

    /** */
    getTo : function()
    {
        return this.to;
    },

    /** */
    getId : function()
    {
        return this.id;
    },

    /** */
    isValid : function()
    {
        return this.m_valid;
    },

    /**
     * 
     */
    getParams : function()
    {
        var retVal = {};

        this.m_startTime = this.xml.data.startTime;
        this.m_endTime = this.xml.data.endTime;

        return retVal;
    },


    /**
     * 
     */
    makeStartEndTime : function()
    {
        this.m_startTime = this.xml.data.startTime;
        this.m_endTime = this.xml.data.endTime;
    },


    /**
     * 
     */
    makeRouteLines : function(vLayer) {
        var vectors = new Array();

        var endIndex = this.m_fromStore.getCount() - 1;
        for ( var i = 0; i <= endIndex; i++) {
            var from = this.m_fromStore.getAt(i);
            var leg = this.m_legStore.getAt(i);
            var mode = from.get('mode');

            if (otp.util.Modes.isTransit(mode)) {
                var geoJson = leg.get('legGeometry');
                var geoLine = new OpenLayers.Feature.Vector(geoJson, null,
                        otp.util.OpenLayersUtils.RED_STYLE);
                var newLine = otp.util.OpenLayersUtils.makeStraightLine(from,
                        this.m_toStore.getAt(i));
                vectors.push(geoLine);
            }
        }

        if (vectors.length > 0) {
            this.concatVectors(vectors);
            if (vLayer) {
                vLayer.addFeatures(vectors);
            }
        }
    },


    /**
     * makes lines between from / to / transfers NOTE: should only be called
     * when creating a new itinerary (not every time that itinerary is drawn)
     */
    makeWalkLines : function(vLayer) {
        var vectors = new Array();

        var endIndex = this.m_fromStore.getCount() - 1;
        for ( var i = 0; i <= endIndex; i++) {
            var from = this.m_fromStore.getAt(i);
            var leg = this.m_legStore.getAt(i);

            var mode = from.get('mode');
            if (mode === 'WALK' || mode === 'BICYCLE' || mode === 'TRANSFER') {
                var geoLine = new OpenLayers.Feature.Vector(leg
                        .get('legGeometry'), null,
                        otp.util.OpenLayersUtils.BLACK_STYLE);
                var newLine = otp.util.OpenLayersUtils.makeStraightLine(from,
                        this.m_toStore.getAt(i));
                vectors.push(geoLine);
            }
        }

        if (vectors.length > 0) {
            this.concatVectors(vectors);
            if (vLayer) {
                vLayer.addFeatures(vectors);
            }
        }
    },

    createAndAddMarker: function(x, y, options)
    {
        var marker = otp.util.OpenLayersUtils.makeMarker(x, y, options);
        this.m_markers.push(marker);
    },

   /**
    * Gets a new Marker Layer for drawing the trip plan's features upon
    */
    makeMarkers : function() {
        var startIndex = 0;
        var endIndex = this.m_fromStore.getCount() - 1;

        var markersToAdd = [];

        // do the FROM marker
        var from = this.m_fromStore.getAt(startIndex);
        var fromP = from.get('geometry');
        var mode = from.get('mode');
        if (mode !== 'WALK' && mode !== 'BICYCLE') {
            // if the first leg isn't a walk or bike, then assume it's a transit
            // leg 
            // so paint the route icon (eg: fromStore.getAt(0))
            startIndex = 0;
            this.createAndAddMarker (fromP.x, fromP.y, {
                type : 'fromMarker',
                mode : mode
            });
        } else {
            // first leg is a walk leg, so mark this point with the from icon
            // that has the walking guy, and move on to next leg in store...
            startIndex = 1;
            var markerType;
            if (mode === 'WALK') {
                markerType = 'fromWalkMarker';
            } else if (mode === 'BICYCLE') {
                markerType = 'fromBicycleMarker';
            } else {
                markerType = 'fromMarker';
            }
            this.createAndAddMarker(fromP.x, fromP.y, {
                type : markerType,
                mode : mode
            });
        }

        // if the last leg is a walk, then paint it now & don't print a route
        // icon (eg: endIndex--)
        var walk = this.m_fromStore.getAt(endIndex);
        var walkP = walk.get('geometry');
        mode = walk.get('mode');
        // Don't draw another walk marker if the first leg is a walk or bike and
        // there's only one leg
        if ((mode === 'WALK' || mode === 'BICYCLE') && endIndex > 0) {
            endIndex--;
            var markerType = (mode === 'BICYCLE') ? 'bicycleMarker'
                    : 'walkMarker';
            markersToAdd.push([walkP.x, walkP.y, {
                type : markerType,
                mode : mode
            }]);
        }

        // save the list of routes for this itinerary the first time around
        var doRoutes = false;
        if (this.m_routes == null) {
            this.m_routes = new Array();
            doRoutes = true;
        }

        // draw the itinerary
        for ( var i = startIndex; i <= endIndex; i++) {
            var from = this.m_fromStore.getAt(i);
            var to   = this.m_toStore.getAt(i);
            var leg  = this.m_legStore.getAt(i);
            var interline = leg.get('interline');
            var route = from.get('routeID');
            var mode = from.get('mode');

            var fromP = from.get('geometry');
            var toP = to.get('geometry');

            // save the route number off (eg: used to show vehicles on the map
            // for these routes, etc...)
            if (doRoutes && route != null && route.length > 0)
                this.m_routes.push(route);

            // only show the route bubble if we're drawing the beginning of the
            // block (eg not a thru route transfer / stay on bus)
            if(interline == null || (interline != "true" && interline !== true))
            {
                this.createAndAddMarker(fromP.x, fromP.y, {
                    type : 'diskMarker',
                    mode : mode
                });
                // TODO: How should street transit links be rendered?
                if (route == "street transit link" || mode == "TRANSFER") {
                    markersToAdd.push([fromP.x, fromP.y, {
                        type : 'walkMarker',
                        mode : mode
                    }]);
                } else {
                    var agencyId = from.get('agencyId');
                    markersToAdd.push([fromP.x, fromP.y, {
                        type : 'routeMarker',
                        mode : mode,
                        route : route,
                        agencyId : agencyId
                    }]);
                }
            }

            // put a disk at the end of this route segment
            this.createAndAddMarker(toP.x, toP.y, {
                type : 'diskMarker'
            });
        }

        this.assignDirectionToMarkers(markersToAdd);
        for (var i = 0; i < markersToAdd.length; ++i) {
            var marker = markersToAdd[i];
            if (marker[2].direction == 'left') {
                if (marker[2].type === 'walkMarker') {
                    marker[2].type = 'walkMarkerLeft';
                } else if (marker[2].type === 'routeMarker') {
                    marker[2].type = 'routeMarkerLeft';
                }
            }
            this.createAndAddMarker(marker[0], marker[1], marker[2]);
        }

        // do the TO (end) marker
        var to = this.m_toStore.getAt(this.m_toStore.getCount() - 1);
        var toP = to.get('geometry');
        this.createAndAddMarker(toP.x, toP.y, {
            type : 'toMarker'
        });
    },

    assignDirectionToMarkers : function(markers) 
    {
        if (markers.length === 0) {
	    return;
        }
        bestDistance = 1000;
        bestMarkerIdx = -1;
        for (var i = 0; i < markers.length - 1; ++i) {
            var x1 = markers[i][0];
            var y1 = markers[i][1];
            var mark1 = markers[i][2];
            var x2 = markers[i+1][0];
            var y2 = markers[i+1][1];
            var mark2 = markers[i+1][2];
            if (undefined === mark1.direction && undefined === mark2.direction) {
                //this pair has not yet been assigned; are they the closest?
                var distance = Math.sqrt((x1-x2)*(x1-x2)+(y1-y2)*(y1-y2));
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestMarkerIdx = i;
                }
            }
        }
        if (bestMarkerIdx === -1) {
            //we have applied direction to all nearest pairs
            //now we want to apply to whatever's left

            //the first marker
            if (undefined === markers[0][2].direction) {
                if (markers.length === 1 || markers[0][1] > markers[1][1]) {
                    //0th marker is right of 1st marker
                    markers[0][2].direction = 'right';
                } else {
                    markers[0][2].direction = 'left';
                }
            }
            //the last marker
            var last = markers.length - 1;
            if (undefined === markers[last][2].direction) {
                if (markers[last][1] > markers[last - 1][1]) {
                    //0th marker is right of 1st marker
                    markers[last][2].direction = 'right';
                } else {
                    markers[last][2].direction = 'left';
                }
            }
            for (var i = 1; i < last; ++i) {
                if (undefined != markers[i].direction) {
                    continue;
                }
                var x0 = markers[i-1][0];
                var y0 = markers[i-1][1];
                var mark0 = markers[i-1][2];
                var x1 = markers[i][0];
                var y1 = markers[i][1];
                var mark1 = markers[i][2];
                var x1 = markers[i][0];
                var y1 = markers[i][1];
                var mark1 = markers[i][2];
                var x2 = markers[i+1][0];
                var y2 = markers[i+1][1];
                var mark2 = markers[i+1][2];

                var distance0 = Math.sqrt((x1-x0)*(x1-x0)+(y1-y0)*(y1-y0));
                var distance1 = Math.sqrt((x1-x2)*(x1-x2)+(y1-y2)*(y1-y2));
                if (distance0 > distance1) {
                    if (x0 > x1) {
                        markers[1][2].direction = 'right';
                    } else {
                        markers[1][2].direction = 'left';
                    }
                } else {
                    if (x0 > x1) {
                        markers[1][2].direction = 'right';
                    } else {
                        markers[1][2].direction = 'left';
                    }
                }
            }
        } else {
            //we have a best pair, so we should make mark their directions
            if (markers[bestMarkerIdx][0] > markers[bestMarkerIdx + 1][0]) {
                markers[bestMarkerIdx][2].direction = "right";
                markers[bestMarkerIdx + 1][2].direction = "left";
            } else {
                markers[bestMarkerIdx][2].direction = "left";
                markers[bestMarkerIdx + 1][2].direction = "right";
            }
            //assign to rest
            this.assignDirectionToMarkers(markers);
        }
    },
//
// TREE STUFF
//
    LEG_ID : '-leg-',

    /** */
    getLegStartPoint : function(id) {
        var nid = id.substring(id.lastIndexOf(this.LEG_ID) + this.LEG_ID.length);
        var retVal = this.m_fromStore.getAt(nid);
        return retVal;
    },

    /** */
    getTreeNodes : function(clickCallback, scope)
    {
        return this.makeTreeNodes(this.m_legStore, this.xml, this.from, this.to, clickCallback, scope);
    },

  /**
    * this method creates new tree nodes, based on the leg store.  each time an itinerary is  
    * selected, this method is called to populate the legs of the itinerary
    * 
    * m_treeNodes = makeTreeNodes(m_legStore, m_itin, from, to, this.legClick);
    *  
    * NOTE: Ext tree nodes (v2 RC1) will not render afert being 'deleted' from their parent.
    *       So we only render a copy of the trip nodes...cleanup is provided via clearNodes above.
    */
    makeTreeNodes : function(store, itin, from, to, clickCallback, scope)
    {
        var fmTxt = this.templates.TP_START.applyTemplate(from.data);
        var toTxt = this.templates.TP_END.applyTemplate(to.data);

        var fmId  = this.id + '-' + otp.planner.Utils.FROM_ID;
        var toId  = this.id + '-' + otp.planner.Utils.TO_ID;
        var tpId  = this.id + '-' + otp.planner.Utils.TRIP_ID;
        
        var containsBikeMode = false;
        var containsCarMode  = false;

        var retVal = new Array();
        retVal.push(otp.util.ExtUtils.makeTreeNode({id: fmId, text: fmTxt, cls: 'itiny', iconCls: 'start-icon', leaf: true},
                                                   clickCallback, scope));

        for(var i = 0; i < store.getCount(); i++)
        {
            var leg = store.getAt(i);
            leg.data.showStopIds = this.showStopIds;
            var text;
            var hasKids = true;
            var sched = null;
            var mode = leg.get('mode').toLowerCase();
            var routeName = leg.get('routeName');
            var agencyId = leg.get('agencyId');
            if(mode === 'walk' || mode === 'bicycle' || mode === 'car') 
            {
                var verb;
                if (mode === 'bicycle') {
                    verb = this.locale.instructions.bike_toward;
                    containsBikeMode = true;
                } else if (mode === 'walk') {
                    verb = this.locale.instructions.walk_toward;
                } else if (mode === 'drive') {
                    containsCarMode = true;
                    verb = this.locale.instructions.drive_toward;
                } else {
                    verb = this.locale.instructions.move_toward;
                }
                hasKids = false;
                if (!leg.data.formattedSteps)
                {
                    leg.data.formattedSteps = [];
                    var steps = leg.data.steps;
                    var stepText = "";
                    var noStepsYet = true;

                    for (var j = 0; j < steps.length; j++)
                    {
                        step = steps[j];
                        if (step.streetName == "street transit link")
                        {
                            // TODO: Include explicit instruction about entering/exiting transit station or stop?
                            continue;
                        }
                        stepText = "<li>";
                        var relativeDirection = step.relativeDirection;
                        var absoluteDirectionText = this.locale.directions[step.absoluteDirection.toLowerCase()];
                        if (relativeDirection == null || noStepsYet == true)
                        {
                            stepText += verb + ' <strong>' + absoluteDirectionText + '</strong> ' + this.locale.directions.on + ' <strong>' + step.streetName + '</strong>';
                            noStepsYet = false;
                        }
                        else 
                        {
                            relativeDirection = relativeDirection.toLowerCase();
                            var directionText = this.locale.directions[relativeDirection];
                            directionText = directionText.substr(0,1).toUpperCase() + directionText.substr(1);
                            if (relativeDirection == "continue")
                            {
                                stepText += directionText + ' <strong>' + steps[j].streetName + '</strong>';
                            }
                            else if (step.stayOn == true)
                            {
                                stepText += directionText + " " + this.locale.directions['to_continue'] + ' <strong>' + step.streetName + '</strong>';
                            }
                            else if (step.becomes == true)
                            {
                                stepText += directionText + ' <strong>' + steps[j-1].streetName + '</strong> ' +  this.locale.directions['becomes'] + ' <strong>' + step.streetName + '</strong>';
                            }
                            else
                            {
                                stepText += directionText; 
                                if (step.exit != null) {
                            		stepText += " " + this.locale.ordinal_exit[step.exit] + " ";
                                }
                                stepText += " " + this.locale.directions['on'] + ' <strong>' + step.streetName + '</strong>';
                            }
                        }
                        stepText += ' (' + otp.planner.Utils.prettyDistance(step.distance) + ')';
                        leg.data.formattedSteps.push(stepText);
                    }
                }
                var template = mode == 'walk' ? 'TP_WALK_LEG' : 'TP_BICYCLE_LEG';
                text = this.templates[template].applyTemplate(leg.data);
            }
            else
            {
                var interline = leg.get('interline');
                if(interline == null || (interline != "true" && interline !== true))
                {
                    text  = this.templates.getTransitLeg().applyTemplate(leg.data);
                }
                else 
                {
                    text = this.templates.getInterlineLeg().applyTemplate(leg.data);
                }
            }
            icon = otp.util.imagePathManager.imagePath({agencyId: agencyId, mode: mode, route: routeName});
            retVal.push(otp.util.ExtUtils.makeTreeNode({id: this.id + this.LEG_ID + i, text: text, cls: 'itiny', icon: icon, iconCls: 'itiny-inline-icon', leaf: hasKids}, clickCallback, scope));
        }

        var tripDetailsDistanceVerb = containsBikeMode ? this.locale.instructions.bike_verb  : 
                                         containsCarMode ? this.locale.instructions.car_verb : this.locale.instructions.walk_verb;
        var tripDetailsData = Ext.apply({}, itin.data, {distanceVerb: tripDetailsDistanceVerb});
        var tpTxt = this.templates.TP_TRIPDETAILS.applyTemplate(tripDetailsData);

        retVal.push(otp.util.ExtUtils.makeTreeNode({id: toId, text: toTxt, cls: 'itiny', iconCls: 'end-icon', leaf: true}, clickCallback, scope));
        retVal.push(otp.util.ExtUtils.makeTreeNode({id: tpId, text: tpTxt, cls: 'trip-details-shell', iconCls: 'no-icon', leaf: true}, clickCallback, scope));

        return retVal;
    },

    CLASS_NAME: "otp.planner.Itinerary"
};

otp.planner.Itinerary = new otp.Class(otp.planner.Itinerary);
