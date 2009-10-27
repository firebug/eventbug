/* See license.txt for terms of usage */
FBL.ns(function() { with (FBL) {

// ************************************************************************************************
// Constants

const Cc = Components.classes;
const Ci = Components.interfaces;

const SHOW_ALL = Ci.nsIDOMNodeFilter.SHOW_ALL;

var eventListenerService = null;

// ************************************************************************************************

// Register string bundle of this extension so, $STR method (implemented by Firebug)
// can be used. Also, perform the registration here so, localized strings used
// in template definitions can be resolved.
Firebug.registerStringBundle("chrome://eventbug/locale/eventbug.properties");

// ************************************************************************************************

/**
 * @module Represents a module for the EventBug extension. It's used to register and
 * unregister Trace listener that customizes trace logs within the FBTrace console.
 */
Firebug.EventModule = extend(Firebug.Module,
/** @lends Firebug.EventModule */
{
    initialize: function(prefDomain, prefNames)
    {
        if (Firebug.TraceModule && Firebug.TraceModule.addListener)
            Firebug.TraceModule.addListener(this.TraceListener);

        Firebug.Module.initialize.apply(this, arguments);
    },

    shutdown: function()
    {
        Firebug.Module.shutdown.apply(this, arguments);

        if (Firebug.TraceModule && Firebug.TraceModule.removeListener)
            Firebug.TraceModule.removeListener(this.TraceListener);
    }
});

// ************************************************************************************************

/**
 * @panel Represents an Events panel displaying a list of registered DOM event listeners.
 * The list is grouped by event types.
 */
function EventPanel() {}
EventPanel.prototype = extend(Firebug.Panel,
/** @lends EventPanel */
{
    name: "events",
    title: $STR("eventbug.Events"),

    initialize: function(context, doc)
    {
        Firebug.Panel.initialize.apply(this, arguments);
        appendStylesheet(doc, "eventBugStyles");
    },

    show: function(state)
    {
        Firebug.Panel.show.apply(this, arguments);

        this.showToolbarButtons("fbEventButtons", true);

        var root = this.context.window.document.documentElement;
        this.selection = this.getBoundEventInfos(root);
        this.rebuild(true);
    },

    hide: function()
    {
        Firebug.Panel.hide.apply(this, arguments);

        this.showToolbarButtons("fbEventButtons", false);
    },

    /**
     * Build content of the panel. The basic layout of the panel is generated by
     * {@link EventInfoTemplate} template.
     */
    rebuild: function()
    {
        try
        {
            if (this.selection)
            {
                EventInfoTemplate.tag.replace({object: this.selection}, this.panelNode);
            }
            else if (!getEventListenerService())
            {
                Warning.show("eventbug.You need Firefox 37", this.panelNode);
            }
            else
            {
                if (FBTrace.DBG_EVENTS)
                    FBTrace.sysout("events.rebuild no this.selection");
            }
        }
        catch(e)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("events.rebuild fails "+e, e);
        }
    },

    getObjectPath: function(object)
    {
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.getObjectPath NOOP", object);
    },

    /**
     * Walk down from elt, build an (elt, info) pair for each listenerInfo,
     * bin all pairs by type (eg 'click').
     */
    getBoundEventInfos: function(elt)
    {
        var els = getEventListenerService();

        // If the listener service isn't available don't iterate the document tree.
        if (!els)
            return;

        var walker = this.context.window.document.createTreeWalker(elt, SHOW_ALL, null, true);

        var node = elt;
        var eventInfos = {};
        for (; node; node = walker.nextNode())
        {
            if (unwrapObject(node).firebugIgnore)
                continue;

            if (FBTrace.DBG_EVENTS)
                FBTrace.sysout("events.getBoundEventInfos "+node, node);

            this.appendEventInfos(node, function buildEventInfos(elt, info)
            {
                var entry = new BoundEventListenerInfo(elt, info);
                if (eventInfos.hasOwnProperty(info.type))
                    eventInfos[info.type].push(entry);
                else
                    eventInfos[info.type] = [entry];  // one handler of this type

                if (FBTrace.DBG_EVENTS)
                    FBTrace.sysout("events.buildEventInfos "+info.type, eventInfos[info.type]);
            });
        }
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.getBoundEventInfos eventInfos", eventInfos);
        return eventInfos;
    },

    appendEventInfos: function(elt, fnTakesEltInfo)
    {
        var els = getEventListenerService();
        if (!els)
            return;

        var infos = els.getListenerInfoFor(elt, {});
        for (var i = 0; i < infos.length; i++)
        {
            var anInfo = infos[i];
            if (anInfo instanceof Ci.nsIEventListenerInfo) // QI
            {
                if (FBTrace.DBG_EVENTS)
                    FBTrace.sysout("events." + this.context.getName()+" info["+i+"] "+
                        anInfo, [elt, anInfo]);
                fnTakesEltInfo(elt, anInfo);
            }
        }
    },

    supportsObject: function(object)
    {
        return 0;
    },
});

// ************************************************************************************************

/**
 * @panel Represents a side panel for the HTML panel. This panel displays list of associated
 * event listeners for selected element.
 */
function EventElementPanel() {}
EventElementPanel.prototype = extend(Firebug.Panel,
/** @lends EventElementPanel */
{
    name: "ElementEvents",
    title: $STR("eventbug.Events"),
    parentPanel: "html",

    initialize: function(context, doc)
    {
        Firebug.Panel.initialize.apply(this, arguments);
        appendStylesheet(doc, "eventBugStyles");
    },

    show: function(state)
    {
        Firebug.Panel.show.apply(this, arguments);
    },

    supportsObject: function(object)
    {
        return false;
    },

    updateSelection: function(element)
    {
        Firebug.Panel.updateSelection.apply(this, arguments);

        if (!(element instanceof Element))
            return;

        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.updateSelection; " + element.localName);

        var els = getEventListenerService();
        if (!els)
        {
            FirebugReps.Warning.tag.replace({object:
                "eventbug.You need Firefox 37"},
                this.panelNode);
            return;
        }

        var listeners = els.getListenerInfoFor(element, {});
        if (listeners && listeners.length)
        {
            ElementListenerInfoRep.tag.replace({listeners: listeners}, this.panelNode);
        }
        else
        {
            FirebugReps.Warning.tag.replace({object:
                "eventbug.This Element has no listeners"},
                this.panelNode);
        }
    },

    getOptionsMenuItems: function()
    {
        return [];
    }
});

// ************************************************************************************************

var BaseRep = domplate(Firebug.Rep,
{
    // xxxHonza: shouldn't this be in Firebug.Rep?
    getNaturalTag: function(value)
    {
        var rep = Firebug.getRep(value);
        var tag = rep.shortTag ? rep.shortTag : rep.tag;
        return tag;
    }
});

// ************************************************************************************************

/**
 * @panel Helper HTML side panel for the Events panel. This panel shows HTML
 * source of the selected element in the Events panel.
 */
function EventHTMLPanel() {}
EventHTMLPanel.prototype = extend(Firebug.HTMLPanel.prototype,
/** @lends EventHTMLPanel */
{
    name: "events-html",
    title: "HTML",
    parentPanel: "events",

    initialize: function(context, doc)
    {
        Firebug.HTMLPanel.prototype.initialize.apply(this, arguments);
    },

    updateSelection: function(info)
    {
        var els = getEventListenerService();
        if (!els)
        {
            FirebugReps.Warning.tag.replace({object:
                "eventbug.You need Firefox 37"},
                this.panelNode);
            return;
        }

        if (info instanceof BoundEventListenerInfo)
            this.select(info.element);
        else
            return Firebug.HTMLPanel.prototype.updateSelection.apply(this, arguments);
    }
});

// ************************************************************************************************

/**
 * @panel
 */
function EventScriptPanel() {}
EventScriptPanel.prototype = extend(Firebug.Panel,
/** @lends EventHTMLPanel */
{
    name: "events-script",
    title: "Script",
    parentPanel: "events",

    initialize: function(context, doc)
    {
        Firebug.Panel.initialize.apply(this, arguments);
    },
});

// ************************************************************************************************

/**
 * @panel This panel displayes a target chain - a list of event targets that would be
 * used as DOMEvent.currentTarget while dispatching an event to event-target.
 * Some events, especially 'load', may actually have a shorter event target chain than
 * what this methods returns.
 */
function EventTargetChainPanel() {}
EventTargetChainPanel.prototype = extend(Firebug.Panel,
/** @lends EventTargetChainPanel */
{
    name: "events-targetChain",
    title: $STR("eventbug.Targets"),
    parentPanel: "events",

    initialize: function(context, doc)
    {
        Firebug.Panel.initialize.apply(this, arguments);
    },

    updateSelection: function(info)
    {
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.EventTargetChainPanel.updateSelection;", info);

        var els = getEventListenerService();
        if (!els)
        {
            FirebugReps.Warning.tag.replace({object:
                "eventbug.You need Firefox 37"},
                this.panelNode);
            return;
        }

        if (!(info instanceof BoundEventListenerInfo))
            return;

        var count = {};
        var targetChain = els.getEventTargetChainFor(info.element, count);

        // Skip all elements outside of the current page window.
        var elements = [];
        for (var i=0; i<targetChain.length; i++)
        {
            var element = targetChain[i];
            elements.push(element);

            if (element instanceof Ci.nsIDOMWindow)
                break;
        }

        // Generate content
        if (elements.length)
            EventTargetChain.tag.replace({targetChain: elements}, this.panelNode);
    }
});

var EventTargetChain = domplate(BaseRep,
{
    tag:
        DIV({"style": "padding: 8px"},
            FOR("element", "$targetChain",
                DIV(
                    TAG("$element|getNaturalTag", {object: "$element"})
                )
            )
        )
});

// ************************************************************************************************

/**
 * @domplate This template is used to render content of Events side panel that is available
 * within the HTML panel.
 */
var ElementListenerInfoRep = domplate(BaseRep,
{
    inspectable: false,

    tag:
        TABLE({"class": "eventInfoTable", cellpadding: 0, cellspacing: 0},
            TBODY(
                FOR("listener", "$listeners",
                    TR({"class": "eventRow", onclick: "$onClickRow", _repObject: "$listener"},
                        TD({"class": "eventTypeCol eventCol"},
                            DIV({"class": "eventLabel"},
                                SPAN({"class": "eventTypeLabel eventLabel"},
                                    "$listener.type"
                                ),
                                SPAN("&nbsp;"),
                                TAG("$listener|getNaturalTag",
                                    {object: "$listener"}
                                )
                            )
                        )
                    )
                )
            )
       ),

    scriptRow:
        TR({"class": "eventScriptRow"},
            TD({"class": "eventScriptCol", colspan: 1})
        ),

    onClickRow: function(event)
    {
        if (isLeftClick(event))
        {
            var row = getAncestorByClass(event.target, "eventRow");
            if (row)
            {
                this.toggleRow(row);
                cancelEvent(event);
            }
        }
    },

    toggleRow: function(row, forceOpen)
    {
        var opened = hasClass(row, "opened");
        if (opened && forceOpen)
            return;

        toggleClass(row, "opened");

        if (hasClass(row, "opened"))
        {
            var scriptRow = this.scriptRow.insertRows({}, row)[0];

            var source = EventListenerInfoRep.getSource(row.repObject);
            var lines = splitLines(source);
            FirebugReps.SourceText.tag.replace({object: {lines: lines}},
                scriptRow.firstChild);
        }
        else
        {
            row.parentNode.removeChild(row.nextSibling);
        }
    },
});

// ************************************************************************************************

function BoundEventListenerInfo(element, eventInfo)
{
    this.element = element;
    this.listener = eventInfo;
}

// ************************************************************************************************

var EventListenerInfoRep = domplate(Firebug.Rep,
{
    tag:
        SPAN({onclick: "$onClickFunction"},
            A({"class": "objectLink objectLink-$linkToType",
                _repObject: "$object"},
                "$object|getHandlerSummary"),
            SPAN("&nbsp;"),
            SPAN({"class": "capturingLabel eventLabel",
                title: $STR("events.addEventListener had use Capturing")},
                "$object|getCapturing"
            ),
            SPAN("&nbsp;"),
            SPAN({"class": "infoLabel eventLabel"},
                "$object|getInfo"
            )
        ),

    getCapturing: function(listener)
    {
        return listener.capturing ? $STR("eventbug.capturing") : "";
    },

    getInfo: function(listener)
    {
        var text = "";

        if (!listener.allowsUntrusted)
            text += $STR("eventbug.block_untrusted");

        if (listener.inSystemEventGroup)
            text += (text ? ", " : "") + $STR("eventbug.inSystemEventGroup");

        return text ? ("(" + text + ")") : "";
    },

    getHandlerSummary: function(listener)
    {
        if (!listener)
            return "";

        var fnAsString = this.getSource(listener);

        var start = fnAsString.indexOf('{');
        var end = fnAsString.lastIndexOf('}') + 1;
        var fncName = cropString(fnAsString.substring(start, end), 20);
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.getHandlerSummary "+fncName, listener);

        return fncName;
    },

    onClickFunction: function(event)
    {
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.onClickFunction, "+event, event);

        if (isLeftClick(event))
        {
            var row = getAncestorByClass(event.target, "objectLink-function");
            if (row)
            {
                if (FBTrace.DBG_EVENTS)
                    FBTrace.sysout("events.onClickFunction, "+row.repObject, row.repObject);

                var listener = row.repObject;
                var link = EventListenerInfoRep.getListenerSourceLink(listener);
                if (link)
                    Firebug.chrome.select(link);
                cancelEvent(event);
            }
        }
    },

    reFunctionName: /unction\s*([^\(]*)/,

    getScriptForListenerInfo: function(listenerInfo)
    {
        var fn = listenerInfo.getDebugObject();
        if (fn && fn instanceof Ci.jsdIValue)
        {
            var script = fn.script;
            return script;
        }
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.getScriptForListenerInfo FAILS: listenerInfo has getDebugObject "+
                fn+" for "+this.getSource(listenerInfo), {fn: fn, listener: listener});
    },

    getListenerSourceLink: function(listener)
    {
        var script = this.getScriptForListenerInfo(listener);
        if (script)
        {
            var contexts = TabWatcher.contexts;  // chromebug
            if (!isSystemURL(FirebugContext.getName()))
                contexts = [FirebugContext]; // Firebug

            for (var i = 0; i < contexts.length; i++)
            {
                var context = contexts[i];

                var sourceFile = Firebug.SourceFile.getSourceFileByScript(context, script);
                if (sourceFile)
                    return getSourceLinkForScript(script, context);
            }
        }
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.getListenerSourceLink FAILS:  script "+script+ "in "+context.getName()+
                " for "+this.getSource(listener),{script: script, listener: listener});
    },

    getSource: function(listenerInfo)
    {
        var script = this.getScriptForListenerInfo(listenerInfo);
        if (script)
            return script.functionObject.stringValue;
        else
            return $STR("eventbug.native_listener");
    },

    // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

    className: "nsIEventListenerInfo",
    linkToType: "function",

    supportsObject: function(object)
    {
        if (!Ci.nsIEventListenerInfo)
            return 0;

        return (object instanceof Ci.nsIEventListenerInfo)?10:0;
    },

    getTooltip: function(listener)
    {
        return this.getHandlerSummary(listener);
    },

    inspectObject: function(listenerInfo, context)
    {
        var script = getScriptForListenerInfo(listenerInfo);

        if (script)
            return context.chrome.select(script);

        // Fallback is to just open the view-source window on the file
        var dataURL = getDataURLForContent(this.getSource(listenerInfo), context.window.location.toString());
        viewSource(dataURL, 1);
    },

    getContextMenuItems: function(sourceLink, target, context)
    {
        return [
            {label: "CopyLocation", command: bindFixed(this.copyLink, this, sourceLink) },
            "-",
            {label: "OpenInTab", command: bindFixed(this.openInTab, this, sourceLink) }
        ];
    }
});

// ************************************************************************************************

var BoundEventListenerInfoRep = domplate(BaseRep,
{
    tag:
        DIV({"class": "eventListenerInfo", _repObject: "$object"},
            TAG("$object.element|getNaturalTag",
                {object: "$object.element"}
            ),
            SPAN({"class": "arrayComma"}, "."),
            TAG("$object.listener|getNaturalTag",
                {object: "$object.listener"}
            )
        ),

    shortTag:
        SPAN({_repObject: "$object"},
            TAG("$object.element|getNaturalTag", {object: "$object.element"})
        ),

    supportsObject: function(object)
    {
        return (object instanceof BoundEventListenerInfo)?10:0;
    },
});

// ************************************************************************************************

/**
 * @domplate: Template for basic layout of the {@link EventPanel} panel.
 */
var EventInfoTemplate = domplate(BaseRep,
{
    tag:
        TABLE({"class": "eventInfoTable", cellpadding: 0, cellspacing: 0},
            TBODY({"class": "eventInfoTBody"},
                FOR("boundEventListeners", "$object|getBoundEventInfosArray",
                    TR({"class": "eventRow", onclick: "$onClickEventType",
                        _repObject:"$boundEventListeners"},
                        TD({"class": "eventTypeCol eventCol"},
                            DIV({"class": "eventTypeLabel eventLabel"},
                                "$boundEventListeners.eventType"
                            )
                        ),
                        TD({"class": "boundEventListenerInfoCell"}
                        )
                    )
                )
            )
        ),

    eventTypeBody:
        TR({"class": "eventTypeBodyRow"},
            TD({"class": "eventTypeBodyCol", colspan: 2},
                TABLE({cellpadding: 0, cellspacing: 0,},
                    TBODY(
                        FOR("info", "$boundEventListeners.infos",
                            TAG("$info|getRowTag", {info: "$info"})
                        )
                    )
                )
            )
        ),

    eventRow:
        TR({"class": "eventRow", _repObject: "$info", onclick: "$onClickEventRow"},
            TD({"class": "eventCol"},
                DIV({"class": "eventRowBox"},
                    TAG(BoundEventListenerInfoRep.tag, {object: "$info"})
                )
            )
        ),

    getRowTag: function()
    {
        return this.eventRow;
    },

    /**
     * Convert from hashTable keyed by eventType to array
     */
    getBoundEventInfosArray: function(boundEventListenersByType)
    {
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.getBoundEventInfosArray had type " + typeof(boundEventListenersByType),
                boundEventListenersByType);

        var members = [];
        for (var eventType in boundEventListenersByType)
        {
            if (boundEventListenersByType.hasOwnProperty(eventType))
            {
                var boundEventListenerInfos = boundEventListenersByType[eventType];
                if (FBTrace.DBG_EVENTS)
                    FBTrace.sysout("events.getBoundEventInfosArray "+eventType+" had type " +
                        typeof(boundEventListenerInfos), boundEventListenerInfos);

                var member = {eventType: eventType, infos: boundEventListenerInfos};
                members.push(member);
            }
        }

        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.getBoundEventInfosArray members "+members.length, members);
        return members;
    },

    getEventListnerInfos: function(boundEventListeners)
    {
        if (FBTrace.DBG_EVENTS)
            FBTrace.sysout("events.getValue ", eventType);
        return eventType.value;
    },

    onClickEventType: function(event)
    {
        if (isLeftClick(event))
        {
            var row = getAncestorByClass(event.target, "eventRow");
            if (row)
            {
                this.toggleRow(row);
                cancelEvent(event);
            }
        }
    },

    toggleRow: function(row)
    {
        toggleClass(row, "opened");
        var opened = hasClass(row, "opened");

        if (hasClass(row, "opened"))
        {
            var boundListeners = row.repObject;
            if (!boundListeners && row.wrappedJSObject)
                boundListeners = row.wrappedJSObject.repObject;
            if (FBTrace.DBG_EVENTS)
                FBTrace.sysout("events.toggleRow boundListeners", boundListeners);

            this.eventTypeBody.insertRows({boundEventListeners: boundListeners}, row);
        }
        else
        {
            row.parentNode.removeChild(row.nextSibling);
        }
    },

    onClickEventRow: function(event)
    {
        if (isLeftClick(event))
        {
            var row = getAncestorByClass(event.target, "eventRow");
            if (row)
                this.selectRow(row);
        }
    },

    selectRow: function(row)
    {
        var panel = Firebug.getElementPanel(row);

        if (panel.selectedRow)
            removeClass(panel.selectedRow, "selected");

        if (panel.selectedRow == row)
            row = null;

        panel.selectedRow = row;

        if (panel.selectedRow)
            setClass(panel.selectedRow, "selected");

        panel.select(panel.selectedRow ? panel.selectedRow.repObject : null);
    }
});

// ************************************************************************************************

var Warning = domplate(Firebug.Reps,
{
    tag:
        TABLE({cellpadding: 0, cellspacing: 0, width: "100%", height: "100%"},
            TBODY(
                TR(
                    TD({"class": "eventWarning"})
                )
            )
        ),

    show: function(message, parentNode)
    {
        var table = this.tag.replace({}, parentNode);
        var column = getElementByClass(table, "eventWarning");
        FirebugReps.Warning.tag.replace({object: message}, column);
    }
});

// ************************************************************************************************
// FBTraceConsole

Firebug.EventModule.TraceListener =
{
    onLoadConsole: function(win, rootNode)
    {
        appendStylesheet(rootNode.ownerDocument);
    },

    onDump: function(message)
    {
        var prefix = "events.";
        var index = message.text.indexOf(prefix);
        if (index == 0)
        {
            message.text = message.text.substr(prefix.length);
            message.text = trimLeft(message.text);
            message.type = "DBG_EVENTS";
        }
    }
};

// ************************************************************************************************
// Helpers

/**
 * Returns <code>@mozilla.org/eventlistenerservice;1</code> service. This method
 * caches reference to the service when called the first time.
 */
function getEventListenerService()
{
    if (!eventListenerService)
    {
        try
        {
            var eventListenerClass = Cc["@mozilla.org/eventlistenerservice;1"];
            eventListenerService = eventListenerClass.getService(Ci.nsIEventListenerService);
        }
        catch (exc)
        {
            if (FBTrace.DBG_ERRORS)
                FBTrace.sysout("events.getEventListenerService FAILS "+exc, exc);
        }
    }
    return eventListenerService;
}

function appendStylesheet(doc)
{
    // Make sure the stylesheet isn't appended twice.
    if (!$("eventBugStyles", doc))
    {
        var styleSheet = createStyleSheet(doc, "chrome://eventbug/skin/eventbug.css");
        styleSheet.setAttribute("id", "eventBugStyles");
        addStyleSheet(doc, styleSheet);
    }
}

// xxxHonza: Remove as soon as Firebug 1.5b2 is out, the method is now available in lib.js 
function unwrapObject(object)
{
    // TODO: Unwrapping should be centralized rather than sprinkling it around ad hoc.
    // TODO: We might be able to make this check more authoritative with QueryInterface.
    if (!object)
        return object;

    if (object.wrappedJSObject)
        return object.wrappedJSObject;

    return object;
}

// ************************************************************************************************
// Tracing Helpers

function dumpEvents()
{
    try
    {
        var els = getEventListenerService();
        if (!els)
            return;

        var elt = document.getElementById("button");
        var info = els.getListenerInfoFor(elt);
        if (info instanceof Components.interfaces.nsIVariant)
        {
            output.heading("nsIVariant typeof info: "+typeof info+"\n");
        }
        else if (info.wrappedJSObject)
        {
            output.heading("wrappedJSObject typeof info: "+typeof info.wrappedJSObject+"\n");
        }
        else
        {
            output.heading("info "+info+"\n");
            output.heading("info.length "+info.length+"\n");
            for (var i = 0; i < info.length; i++)
            {
                var anInfo = info[i];
                if (anInfo instanceof Ci.nsIEventListenerInfo)
                    output.heading("info["+i+"] "+anInfo);
                for (var p in info[i])
                    output.heading('info['+i+"]["+p+']='+info[i][p]);
                 s = "info["+i+"]";
                 s += " type: " + anInfo.type;
                 s += ", toSource(): " + EventListenerInfoRep.getSource(anInfo);
                 s += ", capturing:" + anInfo.capturing;
                 s += ", allowsUntrusted: " + anInfo.allowsUntrusted;
                 s += ", inSystemEventGroup: " + anInfo.inSystemEventGroup + "\n";
                 output.heading(s);
            }
        }
    }
    catch (exc)
    {
        output.heading("Failed to get eventListenerService: "+exc+"\n");
    }
}

// ************************************************************************************************
// Registration

// xxxHonza: what if the stylesheet registration would be as follows:
//Firebug.registerStylesheet("chrome://eventbug/skin/eventbug.css");

Firebug.registerPanel(EventPanel);
Firebug.registerPanel(EventElementPanel);
Firebug.registerPanel(EventHTMLPanel);
Firebug.registerPanel(EventScriptPanel);
Firebug.registerPanel(EventTargetChainPanel);
Firebug.registerRep(EventListenerInfoRep);
Firebug.registerRep(BoundEventListenerInfoRep);
Firebug.registerModule(Firebug.EventModule);

// ************************************************************************************************
}});