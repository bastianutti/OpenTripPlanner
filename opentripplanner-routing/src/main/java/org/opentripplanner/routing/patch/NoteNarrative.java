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

package org.opentripplanner.routing.patch;

import java.util.HashSet;
import java.util.Set;

import org.opentripplanner.routing.core.EdgeNarrative;
import org.opentripplanner.routing.edgetype.DelegatingEdgeNarrative;

public class NoteNarrative extends DelegatingEdgeNarrative {

	private String note;

	public NoteNarrative(EdgeNarrative base, String note) {
		super(base);
		this.note = note;
	}
	
	@Override
	public Set<String> getNotes() {
		Set<String> baseNotes = base.getNotes();
		HashSet<String> notes;
		if (baseNotes != null) {
			 notes = new HashSet<String>(baseNotes);
		} else {
			notes = new HashSet<String>(1);
		}
		notes.add(note);
		return notes;
	}
}