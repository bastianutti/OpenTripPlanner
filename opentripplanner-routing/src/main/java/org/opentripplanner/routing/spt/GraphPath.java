/* This program is free software: you can redistribute it and/or
 modify it under the terms of the GNU Lesser General Public License
 as published by the Free Software Foundation, either version 3 of
 the License, or (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>. */

package org.opentripplanner.routing.spt;

import java.util.LinkedList;
import java.util.List;

import org.onebusaway.gtfs.model.Trip;
import org.opentripplanner.gtfs.GtfsLibrary;
import org.opentripplanner.routing.core.Edge;
import org.opentripplanner.routing.core.EdgeNarrative;
import org.opentripplanner.routing.core.MutableEdgeNarrative;
import org.opentripplanner.routing.core.RouteSpec;
import org.opentripplanner.routing.core.State;
import org.opentripplanner.routing.core.StateEditor;
import org.opentripplanner.routing.core.TraverseOptions;
import org.opentripplanner.routing.core.Vertex;
import org.opentripplanner.routing.edgetype.PatternBoard;

/**
 * A shortest path on the graph.
 */
public class GraphPath {
    public LinkedList<State> states;

    public LinkedList<Edge> edges;

    // needed to track repeat invocations of path-reversing methods
    private boolean back;

    private TraverseOptions options;

    /**
     * Construct a GraphPath based on the given state by following back-edge fields all the way back
     * to the origin of the search. This constructs a proper Java list of states (allowing random
     * access etc.) from the predecessor information left in states by the search algorithm.
     * 
     * Optionally re-traverses all edges backward in order to remove excess waiting time from the
     * final itinerary presented to the user.
     * 
     * @param s
     *            - the state for which a path is requested
     * @param optimize
     *            - whether excess waiting time should be removed
     * @param options
     *            - the traverse options used to reach this state
     */
    public GraphPath(State s, boolean optimize) {
        this.options = s.getOptions();
        this.back = options.isArriveBy();

        /* Put path in chronological order, and optimize as necessary */
        State lastState;
        if (back) {
            lastState = optimize ? optimize(s) : reverse(s, s.getOptions().reversedClone());
        } else {
            lastState = optimize ? reverse(optimize(s), s.getOptions()) : s;
        }
        // DEBUG
        // lastState = s;

        /*
         * Starting from latest (time-wise) state, copy states to the head of a list in reverse
         * chronological order. List indices will thus increase forward in time, and backEdges will
         * be chronologically 'back' relative to their state.
         */
        this.states = new LinkedList<State>();
        this.edges = new LinkedList<Edge>();
        for (State cur = lastState; cur != null; cur = cur.getBackState()) {
            states.addFirst(cur);
            if (cur.getBackEdge() != null)
                edges.addFirst(cur.getBackEdge());
        }
    }

    public long getStartTime() {
        return states.getFirst().getTime();
    }

    public long getEndTime() {
        return states.getLast().getTime();
    }

    public long getDuration() {
        // test to see if it is the same as getStartTime - getEndTime;
        return states.getLast().getElapsedTime();
    }

    public double getWeight() {
        return states.getLast().getWeight();
    }

    public Vertex getStartVertex() {
        return states.getFirst().getVertex();
    }

    public Vertex getEndVertex() {
        return states.getLast().getVertex();
    }

    /**
     * Get a list containing one RouteSpec object for each vehicle boarded in this path.
     * 
     * @return a list of RouteSpec objects for this path
     */
    public List<RouteSpec> getRouteSpecs() {
        List<RouteSpec> ret = new LinkedList<RouteSpec>();
        for (State s : states) {
            Edge e = s.getBackEdge();
            if (e instanceof PatternBoard) {
                Trip trip = ((PatternBoard) e).getPattern().getTrip(s.getTrip());
                String routeName = GtfsLibrary.getRouteName(trip.getRoute());
                RouteSpec spec = new RouteSpec(trip.getId().getAgencyId(), routeName);
                ret.add(spec);
                // TODO: Check implementation, use edge list in graphpath
            }
        }
        return ret;
    }

    public String toString() {
        return "GraphPath(" + states.toString() + ")";
    }

    public boolean equals(Object o) {
        if (o instanceof GraphPath) {
            return this.edges.equals(((GraphPath) o).edges);
        }
        return false;
    }

    // must compare edges, not states, since states are different at each search
    public int hashCode() {
        return this.edges.hashCode();
    }

    /****
     * Private Methods
     ****/

    /**
     * Reverse the path implicit in the given state, i.e. produce a new chain of states that leads
     * from this state to the other end of the implicit path.
     */
    private State reverse(State state, TraverseOptions options) {

        State root = state.createState(state.getTime(), state.getVertex(), options);

        while (state.getBackState() != null) {
            State next = state.getBackState();
            Edge edge = state.getBackEdge();
            EdgeNarrative narrative = state.getBackEdgeNarrative();
            StateEditor editor = root.edit(edge, narrative);
            editor.setTime(next.getTime());
            editor.setFromState(state);
            root = editor.makeState();
            state = state.getBackState();
        }

        return root;
    }

    /**
     * Reverse the path implicit in the given state, re-traversing all edges in the opposite
     * direction so as to remove any unnecessary waiting in the resulting itinerary. This produces a
     * path that passes through all the same edges, but which may have a shorter overall duration
     * due to different weights on time-dependent (e.g. transit boarding) edges.
     * 
     * @param s
     *            - a state resulting from a path search
     * @return a state at the other end of a reversed, optimized path
     */
    private static State optimize(State s) {

        // reverse the search direction
        State ret = s.reversedClone();
        for (State orig = s; orig != null; orig = orig.getBackState()) {
            Edge e = orig.getBackEdge();
            if (e == null)
                continue; // break
            ret = e.traverse(ret);
            EdgeNarrative origNarrative = orig.getBackEdgeNarrative();
            EdgeNarrative retNarrative = ret.getBackEdgeNarrative();
            copyExistingNarrativeToNewNarrativeAsAppropriate(origNarrative, retNarrative);
        }
        return ret;
    }

    private static void copyExistingNarrativeToNewNarrativeAsAppropriate(EdgeNarrative from,
            EdgeNarrative to) {

        if (!(to instanceof MutableEdgeNarrative))
            return;

        MutableEdgeNarrative m = (MutableEdgeNarrative) to;

        if (to.getFromVertex() == null)
            m.setFromVertex(from.getFromVertex());

        if (to.getToVertex() == null)
            m.setToVertex(from.getToVertex());
    }

    public void dump() {
        System.out.println(" --- BEGIN GRAPHPATH DUMP ---");
        System.out.println(this.toString());
        for (State s : states)
            System.out.println(s + " via " + s.getBackEdge());
        System.out.println(" --- END GRAPHPATH DUMP ---");
    }

}