About topoPath:

The topoPath constructor takes as arguments a google map object and google direction result object (this is the object returned when one queries the google direction service, and comprises, among other things, the route that is drawn on the specified map), and produces a container for topographical information along the route that can be displayed using charts or by coloring the given route. 

topoPath prototype methods generate descriptions of the terrain along the route using the results of elevation queries automatically performed along the route.  The terrain descriptions include data such as hill grades and calculated total ascent.  

The hill grades are used to produce a coloring of the route, which gives a graphical display of hill steepness. (Steeper descents have greener hue, steeper climbs tend toward red, and flats are yellow.)

This is intended to be used as part of tools to quickly visualize how hilly a particular route is.  Hopefully this is useful to hikers, runners, cyclists, and motorists. 

topoPath uses the topoPoint class.  See README in topoPoint repository for more information. 

