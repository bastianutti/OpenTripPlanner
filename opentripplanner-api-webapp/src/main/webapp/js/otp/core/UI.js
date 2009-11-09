otp.namespace("otp.core");

/**
 * sets up a Extjs UI
 * @class 
 */
otp.core.UI = {

    locale            : otp.locale.English,

    // panels & viewport
    north         : null,
    south         : null,
    east          : null,
    west          : null,
    center        : null,
    accordion     : null,

    // these inner panels are part of the inner border layout (within the center layout)
    // see getSubPanels() 
    innerCenter   : null,
    innerSouth    : null,
    innerEast     : null,

    viewport      : null,
    map           : null,

    // default config options
    alwaysUseDefaultNorthWestCenter : false,
    centerTitle   : '',

    /**
     * @constructor 
     */
    initialize : function(config)
    {
        console.log("enter ui.UI constructor");
        otp.configure(this, config);

        this.viewport = new Ext.Viewport({
          layout:'border',
          deferredRender:false, 
          items:  this._getSubPanels()
        });

        // if we don't have specific south & east, assign the inners to these vars 
        // NOTE: do this here, vs within _getSubPanels()
        if(this.south == null) this.south = this.innerSouth;
        if(this.east  == null) this.east  = this.innerEast;

        console.log("exit ui.UI constructor");
    },


    /** 
     * get the panels as defined in the constructor config
     * if no panels supplied by the constructor, we'll create a north / west / center ui
     * @private
     */
    _getSubPanels : function()
    {
        var retVal = [];
        
        // no panels defined yet, so create default 3 panel
        if(this.alwaysUseDefaultNorthWestCenter || (this.north == null && this.south == null && this.east == null && this.west == null && this.center == null))
        {
            // default inner - center panel connfig
            var innerCtr = {
                    id:     'center-inner',
                    region: 'center',
                    layout: 'fit',
                    html:     'this is the (inner) center panel'
            };

            // if we have a map attached here, we'll use the GeoExt panel
            if(this.map)
            {
                innerCtr = new GeoExt.MapPanel({
                    id        : otp.util.OpenLayersUtils.MAP_PANEL,
                    region    : 'center',
                    layout    : 'fit',
                    map       : this.map.getMap(),
                    zoom      : this.map.getMap().getZoom(),
                    bodyStyle : 'background-color:#F7F7F2'
                });
            }


            // this config creates an 'inner' boarder layout, with south and east panels into the main panel
            var centerConfig = {
                title:         this.centerTitle,
                region:        'center',
                id:            'center',
                layout:        'border',
                margins:        '1 0 0 0',
                hideMode:       'offsets',
                items:[
                  innerCtr,
                  {
                    hidden:  true,
                    id:      'south',
                    region:  'south',
                    html:    'this is the (inner) south panel',
                    layout:  'fit',
                    height:  140,
                    border:  false,
                    split:   true,
                    useSplitTips:  true,
                    collapseMode: 'mini'
                  }
                  ,
                  {
                    hidden:   true,
                    id:       'east',
                    region:   'east',
                    html:     'this is the (inner) east panel',
                    layout:   'fit',
                    border:   false,
                    width:    250,
                    split:    true,
                    useSplitTips: true,
                    collapseMode: 'mini'
                  }
                ]
            }

            this.center = new Ext.Panel(centerConfig);
            this.innerCenter = this.center.getComponent(0);
            this.innerSouth  = this.center.getComponent(1);
            this.innerEast   = this.center.getComponent(2);
            
            
            this.west   = new Ext.Panel({
                layout:       'accordion',
                region:       'west',
                id:           'west-panel',
                split:        true,
                width:        353,
                minSize:      150,
                maxSize:      450,
                useSplitTips: true,
                collapseMode: 'mini',
                margins:      '30 0 2 3',
                collapsible:   true,
                layoutConfig:{
                    animate:true,
                    collapseFirst: true
                }
            });
            this.accordion = this.west;
        }

        if(this.south)  retVal.push(this.south);
        if(this.east)   retVal.push(this.east);
        if(this.west)   retVal.push(this.west);
        if(this.center) retVal.push(this.center);
        if(this.north)  retVal.push(this.north);

        return retVal;
    },

    /** */
    doLayout : function()
    {
        console.log("UI doLayout");
        try
        {
/*
NOT SURE THAT ALL THESE DO LAYOUTs are providing a benefit beyond what the viewport does...
            if(this.south)                                       this.south.doLayout()
            if(this.innerSouth && this.south != this.innerSouth) this.innerSouth.doLayout()
            if(this.east)                                        this.east.doLayout()
            if(this.innerEast && this.innerEast != this.east)    this.innerEast.doLayout();
            if(this.west)                                        this.west.doLayout();
            if(this.accordion && this.accordion != this.west)    this.accordion.doLayout();
            if(this.map)                                         this.map.updateSize();
*/
            this.viewport.doLayout();
        }
        catch(e)
        {}
    },

    /**
     * close any/all panels except for the main panel
     * @param {Object} doFull
     */
    fullScreen : function(doFull)
    {
        if(doFull)
        {
            if(this.south)                                       this.south.collapse();
            if(this.innerSouth && this.south != this.innerSouth) this.innerSouth.collapse();
            if(this.east)                                        this.east.collapse();
            if(this.innerEast && this.innerEast != this.east)    this.innerEast.collapse();
            if(this.west)                                        this.west.collapse();
            this.isFullScreen = true;
        }
        else
        {
            if(this.south)                                       this.south.expand();
            if(this.innerSouth && this.south != this.innerSouth) this.innerSouth.expand();
            if(this.east)                                        this.east.expand();
            if(this.innerEast && this.innerEast != this.east)    this.innerEast.expand();
            if(this.west)                                        this.west.expand();
            this.isFullScreen = false;
        }
        this.doLayout();
    },


    /**
     * UI clear method
     */
    clear : function()
    {
        this.doLayout();
    },

    CLASS_NAME : "otp.core.UI"
}

otp.core.UI = OpenLayers.Class(otp.core.UI);