FBL.ns(function() { with (FBL) {

var eventListenerService = Components.classes["@mozilla.org/eventlistenerservice;1"].getService(Components.interfaces.nsIEventListenerService);
const Ci = Components.interfaces;
 
const nsIEventListenerInfo = Components.interfaces.nsIEventListenerInfo;

const SHOW_ALL = Ci.nsIDOMNodeFilter.SHOW_ALL;

function BoundEventListenerInfo(element, eventInfo)
{
    this.element = element;
    this.listener = eventInfo;
}

var BoundEventListenerInfoRep = domplate(Firebug.Rep, 
{
    tag: SPAN(
            {_repObject: "$object"},
            TAG("$object.element|getNaturalTag", {object: "$object.element"}),
            SPAN({class: "arrayComma"}, "."),
            TAG("$object.listener|getNaturalTag", {object: "$object.listener"} )
            ),
    
    shortTag:  SPAN(
            {_repObject: "$object"},
            TAG("$object.element|getNaturalTag", {object: "$object.element"}) 
            ),      
            
    getNaturalTag: function(value)
    {
        var rep = Firebug.getRep(value);
        var tag = rep.shortTag ? rep.shortTag : rep.tag;
        return tag;
    },

    supportsObject: function(object)
    {
        return (object instanceof BoundEventListenerInfo)?10:0;
    },
});

var EventListenerInfoRep = domplate(Firebug.Rep,
{
     tag:    SPAN(
                 A({class: "objectLink objectLink-$linkToType", repObject: "$object|getFunction"}, 
                         "$object|getHandlerSummary"),
                 SPAN("$object|getAttributes")
                 ),
 
     getAttributes: function(listener)
     {
         return (listener.capturing?" Capturing ":"") + (listener.allowsUntrusted?" Allows-Untrusted ":"") + (listener.inSystemEventGroup?" System-Event-Group":"");
     },
     
     getHandlerSummary: function(listener)
     {
         if (!listener)
             return "";
         var fnAsString = listener.stringValue;
         var start = fnAsString.indexOf('{');
         var end = fnAsString.lastIndexOf('}') + 1;
         var fncName = cropString(fnAsString.substring(start, end), 37);
         FBTrace.sysout("getHandlerSummary "+fncName, listener);
         return fncName;
     },
     
     reFunctionName: /unction\s*([^\(]*)/,
     
     getFunction: function(listener)
     {
         var script = findScriptForFunctionInContext(FirebugContext, listener.stringValue);
         if (script)
         {
             var fn = script.functionObject.getWrappedValue();
             FBTrace.sysout("getFunction found script "+script.tag+" for "+listener.stringValue, fn);
             return fn;
         }
         else
         {
             var fnAsString = listener.stringValue;
             var m = this.reFunctionName.exec(fnAsString);
             if (m)
                 var seekingName = m[1];
             if (FBTrace.DBG_EVENTS)
                 FBTrace.sysout("getFunction seeking "+seekingName+" the name from "+fnAsString);
             
             var fnc = forEachFunction(FirebugContext, function seek(script, fn)
             {
                 if (FBTrace.DBG_EVENTS)
                     FBTrace.sysout("getFunction trying "+fn.toString());
                 var m =  EventListenerInfoRep.reFunctionName.exec(fn.toString());
                 if (m)
                     var tryingName = m[1];
                 if (seekingName && tryingName && tryingName == seekingName)
                 {
                     if (FBTrace.DBG_EVENTS)
                         FBTrace.sysout("getFunction found same name "+seekingName);
                     return fn;
                 }
                 if (fn.toString() == fnAsString)
                     return fn;
                 if (FBTrace.DBG_EVENTS)
                     FBTrace.sysout("getFunction also trying "+script.functionObject.stringValue);
                 
                 if (script.functionObject.stringValue == fnAsString)
                     return fn;
                 
                 return false;
             });
             if (fnc)
                 return fnc;
             FBTrace.sysout("getFunction no find "+fnAsString);
         }
         return function(){};
     },
     
   // * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *

        linkToType: "function",

        supportsObject: function(object)
        {
            return (object instanceof nsIEventListenerInfo)?10:0;
        },

        getTooltip: function(listener)
        {
            return listener.fnAsString;
        },

        inspectObject: function(listener, context)
        {
            var script = findScriptForFunctionInContext(context, listener.fnAsString);
       
            if (script)
                return context.chrome.select(script);

            // Fallback is to just open the view-source window on the file
            var dataURL = getDataURLForContent(listener.fnAsString, context.window.location.toString());
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



var EventInfoTemplate = domplate
(
    {
        // http://www.softwareishard.com/blog/domplate/domplate-examples-part-ii/ How to use custom iterator in a FOR loop
        tag:
            TABLE(
              FOR("eventType", "$object|getEventsByType",
                TR(
                  { class: "memberRow", onclick: "$onClickRow", _repObject:"$eventType|getValue" },
                  TD(
                          {class: "memberLabel userLabel",  $hasChildren: "$eventType.hasChildren"}, 
                          "$eventType.label"
                      ),
                  TD(
                      TAG("$eventType.tag", {object: "$eventType|getValue"})
                  )
                )
              )
            ),

        getEventsByType: function(object) // key type, value array of BoundEventInfo
        {
             FBTrace.sysout("getEventsByType had type "+typeof(object), object);
            var members = [];
            for (var p in object)
            {
                if (object.hasOwnProperty(p))
                {
                    var value = object[p];
                    FBTrace.sysout("getEventsByType "+p+" had type "+typeof(value), value);
                    var member = {label: p, value: object[p], tag: BoundEventListenerInfoRep.tag};
                    if (value instanceof Array)
                    {
                        member.tag = FirebugReps.Arr.tag;
                        member.hasChildren = true;
                    }
                    members.push(member);
                }
            }
            FBTrace.sysout("getEventsByType members "+members.length, members);
            return members;
        },
        
        getValue: function(eventType)
        {
            FBTrace.sysout("getValue ", eventType);
            return eventType.value;
        },
        
        getNaturalTag: function(value)
        {
            var rep = Firebug.getRep(value);
            var tag = rep.shortTag ? rep.shortTag : rep.tag;
            return tag;
        },
        
        onClickRow: function(event)
        {FBTrace.sysout("onClickRow", event);
            if (isLeftClick(event))
            {
                var row = getAncestorByClass(event.target, "memberRow");
                if (row)
                {
                    this.toggleRow(row);
                    cancelEvent(event);
                }
            }
        },

        rowTag: FOR("boundListener", "$boundListeners",
                TR(
                    { class: "memberRow", onclick: "$onClickRow", _repObject:"$boundListener" },
                        TD({class: "memberLabel userLabel"}, "$boundListener.element"),
                        TD(
                            TAG(EventListenerInfoRep.tag, {object: "$boundListener.listener"})
                        )
                      )
                    ),
        
        toggleRow: function(row)
        {
            toggleClass(row, "opened");
            var opened = hasClass(row, "opened");
            FBTrace.sysout("toggleRow opened "+opened, row);
                        
            if (hasClass(row, "opened"))
            {
                var boundListeners = row.repObject;
                if (!boundListeners && row.wrappedJSObject)
                    boundListeners = row.wrappedJSObject.repObject;
                FBTrace.sysout("toggleRow boundListeners", boundListeners);
                var bodyRow = this.rowTag.insertRows({boundListeners: boundListeners}, row, this)[0];
            }
            else
            {
                row.parentNode.removeChild(row.nextSibling);
            }
        }
    }
);

function EventPanel() {}

EventPanel.prototype  = extend(Firebug.Panel,
{
    name: "events",
    title: "Events",

    initializeNode: function()
    {
    },
     
    initialize: function(context, doc) 
    {
        this.context = context;
        Firebug.DOMBasePanel.prototype.initialize.apply(this, arguments);
    },
    
    show: function(state)
    {
        var root = this.context.window.document.documentElement;
        this.selection = this.getEventInfosRecursive(root);
        this.rebuild(true);
    },
    
    rebuild: function()
    {
        try
        {
            EventInfoTemplate.tag.replace({object: this.selection}, this.panelNode, EventInfoTemplate);
        }
        catch(e)
        {
            FBTrace.sysout("Event.rebuild fails "+e, e);
        }
    },
    
    getObjectPath: function(object)
    {
        FBTrace.sysout("event getObjectPath", object);
    }, 
    /***************************************************************************************/
    getEventInfosRecursive: function(elt)
    {
        var walker = this.context.window.document.createTreeWalker(elt, SHOW_ALL, null, true);
        
        var node = elt;
        var eventInfos = {};
        for (; node; node = walker.nextNode())
        {
            if(FBTrace.DBG_EVENTS)
                FBTrace.sysout("getEventInfosRecursive "+node, node);
            this.appendEventInfos(node, function buildEventInfos(elt, info)
            {
                var entry = new BoundEventListenerInfo( elt,  info);
                if (eventInfos.hasOwnProperty(info.type))
                {
                    if ( eventInfos[info.type] instanceof Array) 
                        eventInfos[info.type].push(entry);  // more than two
                    else
                        eventInfos[info.type] = [eventInfos[info.type], entry]; // two handlers
                }
                else
                    eventInfos[info.type] = entry;  // one handler of this type
                FBTrace.sysout("buildEventInfos "+info.type, eventInfos[info.type]);
            });
        }
        FBTrace.sysout("getEventInfosRecursive eventInfos", eventInfos);
        return eventInfos;
    },
    
    appendEventInfos: function(elt, fnTakesEltInfo)
    {
        var infos = eventListenerService.getListenerInfoFor(elt);
        for (var i = 0; i < infos.length; i++)
        {
            var anInfo = infos[i];
            if (anInfo instanceof nsIEventListenerInfo) // QI
            {
                if(FBTrace.DBG_EVENTS)
                    FBTrace.sysout(this.context.getName()+" info["+i+"] "+anInfo, [elt, anInfo]);
                fnTakesEltInfo(elt, anInfo);
            }
        }
    }
   
});


function dumpEvents() 
{
    try 
    {
        var eventListenerService = Components.classes["@mozilla.org/eventlistenerservice;1"].getService(Components.interfaces.nsIEventListenerService);
        var elt = document.getElementById("button");
        var info = eventListenerService.getListenerInfoFor(elt);
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
                if (anInfo instanceof Components.interfaces.nsIEventListenerInfo)
                    output.heading("info["+i+"] "+anInfo);
                for (var p in info[i])
                    output.heading('info['+i+"]["+p+']='+info[i][p]);
                s = "info["+i+"]";
                 s += " type: " + anInfo.type;
                 s += ", stringValue: " + anInfo.stringValue;
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


Firebug.registerPanel(EventPanel);
Firebug.registerRep(EventListenerInfoRep);
Firebug.registerRep(BoundEventListenerInfoRep);


}});