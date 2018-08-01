/******************************************************************************
 *  rotation manager - a cinnamon applet for all your display rotation needs  *
 *  Copyright (C) 2018 Alexander Heuer <evilphish@phishtank.de>               *
 *                                                                            *
 *  This program is free software: you can redistribute it and/or modify      *
 *  it under the terms of the GNU General Public License v2 as published by   *
 *  the Free Software Foundation.                                             *
 *                                                                            *
 *  This program is distributed in the hope that it will be useful,           *
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of            *
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the             *
 *  GNU General Public License for more details.                              *
 *                                                                            *
 *  You should have received a copy of the GNU General Public License         *
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.     *
 ******************************************************************************/

const Applet = imports.ui.applet;
const Util = imports.misc.util;
const Iface = imports.misc.interfaces;
const Main = imports.ui.main;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const SignalManager = imports.misc.signalManager;
const PopupMenu = imports.ui.popupMenu;
const Settings = imports.ui.settings;
const GObject = imports.gi.GObject;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

function RotMgr(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}


const SensorProxyIntrospectOld = '\
<node> \
  <interface name="net.hadess.SensorProxy"> \
    <method name="ClaimAccelerometer"> \
    </method> \
    <method name="ReleaseAccelerometer"> \
    </method> \
    <method name="ClaimLight"> \
    </method> \
    <method name="ReleaseLight"> \
    </method> \
    <property type="b" name="HasAccelerometer" access="read"> \
    </property> \
    <property type="s" name="AccelerometerOrientation" access="read"> \
    </property> \
    <property type="b" name="HasAmbientLight" access="read"> \
    </property> \
    <property type="s" name="LightLevelUnit" access="read"> \
    </property> \
    <property type="d" name="LightLevel" access="read"> \
    </property> \
  </interface> \
</node>';


const SensorProxyIntrospect = ' \
<node> \
  <interface name="org.freedesktop.DBus.Properties"> \
    <method name="Get"> \
      <arg type="s" name="interface_name" direction="in"/> \
      <arg type="s" name="property_name" direction="in"/> \
      <arg type="v" name="value" direction="out"/> \
    </method> \
    <method name="GetAll"> \
      <arg type="s" name="interface_name" direction="in"/> \
      <arg type="a{sv}" name="properties" direction="out"/> \
    </method> \
    <method name="Set"> \
      <arg type="s" name="interface_name" direction="in"/> \
      <arg type="s" name="property_name" direction="in"/> \
      <arg type="v" name="value" direction="in"/> \
    </method> \
    <signal name="PropertiesChanged"> \
      <arg type="s" name="interface_name"/> \
      <arg type="a{sv}" name="changed_properties"/> \
      <arg type="as" name="invalidated_properties"/> \
    </signal> \
  </interface> \
  <interface name="org.freedesktop.DBus.Introspectable"> \
    <method name="Introspect"> \
      <arg type="s" name="xml_data" direction="out"/> \
    </method> \
  </interface> \
  <interface name="org.freedesktop.DBus.Peer"> \
    <method name="Ping"/> \
    <method name="GetMachineId"> \
      <arg type="s" name="machine_uuid" direction="out"/> \
    </method> \
  </interface> \
  <interface name="net.hadess.SensorProxy"> \
    <method name="ClaimAccelerometer"> \
    </method> \
    <method name="ReleaseAccelerometer"> \
    </method> \
    <method name="ClaimLight"> \
    </method> \
    <method name="ReleaseLight"> \
    </method> \
    <property type="b" name="HasAccelerometer" access="read"> \
    </property> \
    <property type="s" name="AccelerometerOrientation" access="read"> \
    </property> \
    <property type="b" name="HasAmbientLight" access="read"> \
    </property> \
    <property type="s" name="LightLevelUnit" access="read"> \
    </property> \
    <property type="d" name="LightLevel" access="read"> \
    </property> \
  </interface> \
  <node name="Compass"/> \
</node>';

const GSensorProxy = Gio.DBusProxy.makeProxyWrapper(SensorProxyIntrospectOld);

// abbreviate orientation for display in the panel applet
function abbrevOrientation(longname) {
    let abbrev = '';
    switch (longname) {
    case 'normal':
	abbrev = 'nm';
	break;
    case 'left-up':
	abbrev = 'lu';
	break;
    case 'right-up':
	abbrev = 'ru';
	break;
    case 'bottom-up':
	abbrev = 'bu';
	break;
    }

    return abbrev;
}

function OrientationChangeButton(iconName,label) {
    this._init(iconName,label);
}
OrientationChangeButton.prototype = {
    __proto__: PopupMenu.PopupBaseMenuItem.prototype,

    _init: function(iconName,label="") {
	PopupMenu.PopupBaseMenuItem.prototype._init.call(this, {
	    hover: false,
	    activate: true,
	});

	this.default_size = 84;
	this.actor.x_align = St.Align.MIDDLE;
	this.actor.y_align = St.Align.MIDDLE;
//	this.actor.x_expand = true;
//	this.actor.y_expand = true;
	this.actor.set_style('padding-left: 0px; padding-right: 0px;');
	this.active = false;
	this.icon = new St.Icon({
	    icon_name: iconName,
	    icon_type: St.IconType.FULLCOLOR,
	    icon_size: 64,
	});

	this.buttonBox = new St.BoxLayout({
	    width: this.default_size,
	    height: this.default_size,
	    vertical: true,
	});

	this.buttonBox.add(this.icon, {
	    x_fill: false,
	    y_fill: false,
	    expand: true,
	    x_align: St.Align.MIDDLE,
	    y_align: St.Align.END
	});

	this.buttonLabel = new St.Label({
	    text: label
	});
	
	this.buttonBox.add(this.buttonLabel, {
	    x_fill: false,
	    y_fill: false,
	    expand: true,
	    x_align: St.Align.MIDDLE,
	    y_align: St.Align.START
	});

	this.addActor(this.buttonBox);

    },

    _updateActiveStyle: function() {
	if (this.active) {
	    this.actor.add_style_pseudo_class('active');
	} else {
	    this.actor.remove_style_pseudo_class('active');
	}
    },

    setSize: function(sizepercent) {
	this.buttonBox.width = this.default_size*sizepercent/100;
	this.buttonBox.height = this.default_size*sizepercent/100;
    },
    
    // keep the active state even if mouse pointer leaves the button
    _onHoverChanged: function(actor) {},
    _onKeyFocusIn: function(actor) {},
    _onKeyFocusOut: function(actor) {}
};


RotMgr.prototype = {
    __proto__: Applet.TextIconApplet.prototype,

    // init the applet
    _init: function(orientation, panel_height, instance_id) {
	Applet.TextIconApplet.prototype._init.call(this, orientation, panel_height, instance_id);

	// set up applet right click settings
	this._preferences = {};
	this.settings = new Settings.AppletSettings(this._preferences, "rotmgr@evilphish", instance_id);
	this._bind_settings();
	
	this.orientation = orientation;
	this.set_applet_icon_name("display");
	this.set_applet_tooltip(_("Manage display and input device rotation"));
	this.actor.set_style("min-width: 2em");

	this._signalManager = new SignalManager.SignalManager(this);

	// set up GSettings for the touchscreen orientation lock setting
	this.rotsettings = new Gio.Settings ({ schema_id: 'org.cinnamon.settings-daemon.peripherals.touchscreen' });
	// connect to signal handler to get change of orientation lock
	this.signal_olock = this.rotsettings.connect(
	    'changed::orientation-lock',
	    Lang.bind(this, this.on_olock_changed));
	
	// set up accelerometer dbus access
	this.sensorProxy = new GSensorProxy (
	    Gio.DBus.system,
	    "net.hadess.SensorProxy",
	    "/net/hadess/SensorProxy"
	);

	// accelerometer rotation detection handler
	this._signalManager.connect(
	    this.sensorProxy,
	    'g-properties-changed',
	    this.on_display_orientation_change,
	    this);

	// variables
	this.regex = {};
	this.regex.touchpad = /(.*(?:TouchPad|TrackPoint|Keyboard)).*id=(\d+)/ig;
	this.regex.inputenabled = /Device Enabled \(\d+\):.*(\d+)/i;
	this.regex.touch = /(.*(?: Finger )).*id=(\d+)/ig;
	this.regex.xroutput = /^([^ \t]+) connected/im;
	this.previous_orientation = this.get_sensor_orientation();
	this.xinput_state = true;
	
	// initialize context menu
	this._init_context_menu();
	this._init_signals();
	
	// initialize elements with starting values
	this.set_panel_label(abbrevOrientation(this.get_sensor_orientation()));	
	
    },

    _init_context_menu: function() {
	this.menuManager = new PopupMenu.PopupMenuManager(this);
	this.menu = new Applet.AppletPopupMenu(this,this.orientation);
	this.menuManager.addMenu(this.menu);

	this.section = new PopupMenu.PopupMenuSection();
	this.menu.addMenuItem(this.section);
	
//	this.menu_olabel = new PopupMenu.PopupMenuItem("Orientation: "+this.get_sensor_orientation(), { reactive: false });
//	this.menu.addMenuItem(this.menu_olabel);
	this.menu_obutton = {};
	this.menu_obutton.normal = new OrientationChangeButton("top","Normal");
	this.menu_obutton.normal.setActive(true);
	this.menu_obutton.left_up = new OrientationChangeButton("object-rotate-right","Left-Up");
	this.menu_obutton.right_up = new OrientationChangeButton("object-rotate-left","Right-Up");
	this.menu_obutton.bottom_up = new OrientationChangeButton("bottom","Bottom-Up");


	this.orientationGridBox = new Clutter.Actor({
	    layout_manager: new Clutter.GridLayout(),
	    reactive: true, 
	    x_expand: true
	});
	let gridLayout = this.orientationGridBox.layout_manager;
	gridLayout.attach(this.menu_obutton.normal.actor,0,0,1,1);
	gridLayout.attach(this.menu_obutton.left_up.actor,1,0,1,1);
	gridLayout.attach(this.menu_obutton.right_up.actor,2,0,1,1);
	gridLayout.attach(this.menu_obutton.bottom_up.actor,3,0,1,1);

	this.orientationBoxWrapper = new St.BoxLayout();
	this.orientationBoxWrapper.add(this.orientationGridBox);
	this.menu_obuttons = new PopupMenu.PopupMenuSection();
	this.menu_obuttons.actor.add_actor(this.orientationBoxWrapper);
	this.menu.addMenuItem(this.menu_obuttons);

	// create the orientation drop-down menu
	this.menu_oselect = new PopupMenu.PopupSubMenuMenuItem("Orientation");
	this.menu_oselect.orients = [];
	this.menu_oselect.normal = new PopupMenu.PopupMenuItem("Normal");
	this.menu_oselect.normal.setShowDot(true);
	this.menu_oselect.menu.addMenuItem(this.menu_oselect.normal);
	this.menu_oselect.left_up = new PopupMenu.PopupMenuItem("Left-Up");
	this.menu_oselect.menu.addMenuItem(this.menu_oselect.left_up);
	this.menu_oselect.right_up = new PopupMenu.PopupMenuItem("Right-Up");
	this.menu_oselect.menu.addMenuItem(this.menu_oselect.right_up);
	this.menu_oselect.bottom_up = new PopupMenu.PopupMenuItem("Bottom-Up");
	this.menu_oselect.menu.addMenuItem(this.menu_oselect.bottom_up);

	this.menu.addMenuItem(this.menu_oselect);


	// toggle orientation lock
	this.menu_olock = new PopupMenu.PopupSwitchMenuItem("Orientation Lock",this.get_orientation_lock());
	// sort of a failed attempt at scaling the damn checkbox switch button thingy
	//this.menu_olock.actor.set_style('font-size: '+this._preferences.uiscale*100+'%;');
	//this.menu_olock._statusBin.set_property("x-fill", true);
	//this.menu_olock._statusBin.set_property("y-fill", true);
	//this.menu_olock._statusBin.set_style('width: 200%; height: 200%; background-size: contain;');
	//this.menu_olock._statusBin.child.set_style('width: 200%; background-size: contain;'); // DOESNT DO ANYTHING				       
	this.menu.addMenuItem(this.menu_olock);

	this.menu_togglexinput = new PopupMenu.PopupSwitchMenuItem("Toggle Xinput Devices", true);
//	this.menu_togglexinput.actor.set_style('font-size: '+this._preferences.uiscale*100+'%;');
	this.menu.addMenuItem(this.menu_togglexinput);
	this.on_settings_scale_changed();
	this.on_settings_ochanger_changed();
    },

    // initialize signals
    _init_signals: function() {
	this._signalManager.connect(
	    this.menu_olock,
	    'activate',
	    this.toggle_rotation_lock,
	    this);
	    
	this._signalManager.connect(
	    this.menu_togglexinput,
	    'activate',
	    this.toggle_xinput_devices,
	    this);

	this._signalManager.connect(
	    this.menu_oselect.normal,
	    'activate',
	    this.choose_orientation_normal,
	    this);

	this._signalManager.connect(
	    this.menu_oselect.left_up,
	    'activate',
	    this.choose_orientation_left_up,
	    this);

	this._signalManager.connect(
	    this.menu_oselect.right_up,
	    'activate',
	    this.choose_orientation_right_up,
	    this);

	this._signalManager.connect(
	    this.menu_oselect.bottom_up,
	    'activate',
	    this.choose_orientation_bottom_up,
	    this);

	this._signalManager.connect(
	    this.menu_obutton.normal,
	    'activate',
	    this.choose_orientation_normal,
	    this);

	this._signalManager.connect(
	    this.menu_obutton.left_up,
	    'activate',
	    this.choose_orientation_left_up,
	    this);

	this._signalManager.connect(
	    this.menu_obutton.right_up,
	    'activate',
	    this.choose_orientation_right_up,
	    this);

	this._signalManager.connect(
	    this.menu_obutton.bottom_up,
	    'activate',
	    this.choose_orientation_bottom_up,
	    this);

    },

    // bind settings to a property
    _bind_settings: function() {
	this.settings.bind("uiscale", "uiscale", Lang.bind(this, this.on_settings_scale_changed), null);
	this.settings.bind("showorientation", "showorientation", Lang.bind(this, this.on_settings_showorientation_changed), null);

	this.settings.bind("autotoggle", "autotoggle", Lang.bind(this, this.on_settings_showorientation_changed), null);

	this.settings.bind("notifyorientation", "notifyorientation", null);
	this.settings.bind("notifyolock", "notifyolock", null);
	this.settings.bind("showobuttons", "showobuttons", Lang.bind(this, this.on_settings_ochanger_changed), null);
	this.settings.bind("showomenu", "showomenu", Lang.bind(this, this.on_settings_ochanger_changed), null);
    },

    // applet removed: destroy signals
    on_applet_removed_from_panel: function(deleteConfig) {
	this.menu_buttonnormal.destroy();
	this.menu_buttonleftup.destroy();
	this.menu_buttonrightup.destroy();
	this.menu_buttonbottomup.destroy();

	this._signalManager.disconnectAllSignals();
	this.rotsettings.disconnect(this.signal_olock);
    },

    // open the menu
    on_applet_clicked: function() {
	this.menu.toggle();
    },

    // accelerometer rotation handler
    // called if accelerometer orientation changes
    // only do stuff if the olock is not set
    on_display_orientation_change: function(proxy, error) {
	if (!this.get_orientation_lock()) {
	    let or = proxy.AccelerometerOrientation;

	    this.autotoggle_xinput_devices(or);
	    this.update_rotation_info(or);
	    this.previous_orientation = or;
	}
    },

    // automatically toggle xinput devices according to auto toggle setting
    // this should disable touchpad / trackpoint if not in normal orientation
    autotoggle_xinput_devices: function(or) {
	if (this._preferences.autotoggle) {
	    if (!this.xinput_state && or == "normal" && this.previous_orientation != "normal") {
		this.menu_togglexinput.activate();
	    } else if (this.xinput_state && or != "normal" && this.previous_orientation == "normal") {
		this.menu_togglexinput.activate();
	    }
	}
    },
    
    // update rotation info and labels on the applet
    update_rotation_info: function(orient) {
	this.set_panel_label(abbrevOrientation(orient));
//	this.menu_olabel.label.set_text("Orientation: "+orient);
	this.set_orientation_menu(orient);
	if (this._preferences.notifyorientation) {
	    Main.notify("Orientation "+orient);
	}
    },
    
    // set the "dot" in the menu
    set_orientation_menu: function(orient) {
	// mapping of orientation names
	const orientation_list = { "normal": "normal",
				   "left-up": "left_up",
				   "right-up": "right_up",
				   "bottom-up": "bottom_up" };

	for (let o in orientation_list) {
	    let or = orientation_list[o]
	    this.menu_oselect[or].setShowDot(o == orient);
	    this.menu_obutton[or].setActive(o == orient);
	}
    },

    // handlers for choosing the orientation manually via the drop-down menu
    choose_orientation_normal: function() { this.choose_orientation("normal"); },
    choose_orientation_left_up: function() { this.choose_orientation("left-up"); },
    choose_orientation_right_up: function() { this.choose_orientation("right-up"); },
    choose_orientation_bottom_up: function() { this.choose_orientation("bottom-up"); },
    choose_orientation: function(orient) {
	this.rotate_display(orient);
	this.autotoggle_xinput_devices(orient);
	this.update_rotation_info(orient);
	this.previous_orientation = orient;
    },

    // get the first connected display output
    get_xrandr_output: function() {
	var [success, out, error, status] = GLib.spawn_command_line_sync('xrandr');
	var outputs = this.regex.xroutput.exec(out);
	return outputs[1];
    },

    // rotate the display manually
    // fire xrandr rotation commands and take care of rotating the touch (finger)
    // pointing device along with the screen
    rotate_display: function(orient) {
	const xrandr_orients = { "normal": "normal",
				 "left-up": "left",
				 "right-up": "right",
				 "bottom-up": "inverted" };
	const xinput_transformation_matrix = { "normal": "1 0 0 0 1 0 0 0 1",
					       "left-up": "0 -1 1 1 0 0 0 0 1",
					       "right-up": "0 1 0 -1 0 1 0 0 1",
					       "bottom-up": "-1 0 1 0 -1 1 0 0 1" };
	let devices = this.get_xinput_list(this.regex.touch);

	global.log("output: "+this.get_xrandr_output());
	// rotate screen
	var [success, out, error, status] = GLib.spawn_command_line_sync('xrandr --output '+this.get_xrandr_output()+' --rotate '+xrandr_orients[orient]);
	if (!success) {
	    Main.notifyError("Error rotating screen with xrandr!",error);
	}

	// rotate touch devices (finger touch)
	// Somehow not needed with newer xrandr? 
	//	for (let dev of devices) {
	//	    [success, out, error, status] = GLib.spawn_command_line_sync('xinput set-prop '+dev.id+' "Coordinate Transformation Matrix" '+xinput_transformation_matrix[orient]);
	//}

    },
    
    // orientation lock handler
    on_olock_changed: function(settings, key) {
	this.menu_olock.setToggleState(settings.get_boolean(key));

	if (this._preferences.notifyolock) {
	    Main.notify("Orientation lock: "+(settings.get_boolean(key) ? "on" : "off"));
	}
    },

    // retrieve orientation lock status
    get_orientation_lock: function() {
	return this.rotsettings.get_boolean('orientation-lock');
    },

    // retrieve current orientation of the accelerometer
    get_sensor_orientation: function() {
	return this.sensorProxy.AccelerometerOrientation;
    },

    // return a list of xinput devices
    // takes a regex filter with which to do the initial filtering of the xinput output
    // filter should provide matches for name and id. 
    get_xinput_list: function(filterregex) {
	let [success, out, error, status] = GLib.spawn_command_line_sync('xinput --list');
	var outarray;
	var retarray = [];
	filterregex.lastIndex = 0;

	while ((outarray = filterregex.exec(out)) !== null) {
	    let [success, out, error, status] = GLib.spawn_command_line_sync('xinput list-props '+outarray[2]);
	    var enbld = this.regex.inputenabled.exec(out);

	    retarray.push({ "name": outarray[1].substr(6),
			    "id": outarray[2],
			    "enabled": enbld[1] == 1 ? true : false });
	}
	return retarray;
    },


    // set the label on the panel applet
    set_panel_label: function(text) {
	this.set_applet_label(text);
	this.hide_applet_label(!this._preferences.showorientation);
    },
    
    // menu orientation lock handler
    toggle_rotation_lock: function() {
	let olock = this.get_orientation_lock();
	this.rotsettings.set_boolean('orientation-lock', !olock);
	if (!this.get_orientation_lock()) {
	    this.on_display_orientation_change(this.sensorProxy, null);
	}
    },

    // toggle touchpad / trackpoint devices on/off
    toggle_xinput_devices: function() {
	let devices = this.get_xinput_list(this.regex.touchpad);
	for (let dev of devices) {
	    if (dev.enabled) {
		this.disable_xinput_device(dev.id);
	    } else {
		this.enable_xinput_device(dev.id);
	    }
	}
	this.xinput_state = !this.xinput_state;
    },

    // enable an xinput device by its id
    enable_xinput_device: function(id) {
	let [success, out, error, status] = GLib.spawn_command_line_sync('xinput --enable '+id);
    },

    // disable an xinput device by its id
    disable_xinput_device: function(id) {
	let [success, out, error, status] = GLib.spawn_command_line_sync('xinput --disable '+id);
    },
    
    // settings changed
    on_settings_scale_changed: function() {
	this.menu_olock.actor.set_style('font-size: '+this._preferences.uiscale*100.0+'%;');
	this.menu_togglexinput.actor.set_style('font-size: '+this._preferences.uiscale*100+'%;');
	this.menu_oselect.actor.set_style('font-size: '+this._preferences.uiscale*100+'%;');
	this.menu_oselect.normal.actor.set_style('font-size: '+this._preferences.uiscale*100+'%;');
	this.menu_oselect.left_up.actor.set_style('font-size: '+this._preferences.uiscale*100+'%;');
	this.menu_oselect.right_up.actor.set_style('font-size: '+this._preferences.uiscale*100+'%;');
	this.menu_oselect.bottom_up.actor.set_style('font-size: '+this._preferences.uiscale*100+'%;');
	this.menu_obutton.normal.setSize(100+(this._preferences.uiscale-1)*30);
	this.menu_obutton.left_up.setSize(100+(this._preferences.uiscale-1)*30);
	this.menu_obutton.right_up.setSize(100+(this._preferences.uiscale-1)*30);
	this.menu_obutton.bottom_up.setSize(100+(this._preferences.uiscale-1)*30);
    },

    on_settings_showorientation_changed: function() {
	this.hide_applet_label(!this._preferences.showorientation);
    },

    on_settings_ochanger_changed: function() {
	if (this._preferences.showobuttons) { this.menu_obuttons.actor.show(); }
	else {this.menu_obuttons.actor.hide();}
	if (this._preferences.showomenu) { this.menu_oselect.actor.show(); }
	else {this.menu_oselect.actor.hide();}
    }


}

function main(metadata, orientation, panel_height, instance_id) {
    return new RotMgr(orientation, panel_height, instance_id);
}
