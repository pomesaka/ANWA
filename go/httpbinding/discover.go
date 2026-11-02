package httpbinding

import (
	"net/http"
	"strings"
)

func (b binding) discover(w http.ResponseWriter, r *http.Request) {
	ref := r.PathValue("ref")
	if ref == "" || strings.ContainsAny(ref, "/%") {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "Interaction not found")
		return
	}
	ctx, ok := b.caller(w, r)
	if !ok {
		return
	}
	result, err := b.runtime.Discover(ref, ctx)
	if err != nil {
		writeProblem(w, http.StatusNotFound, "NOT_FOUND", "Interaction not found")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
