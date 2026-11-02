package httpbinding

import "net/http"

func (b binding) catalog(w http.ResponseWriter, r *http.Request) {
	ctx, ok := b.caller(w, r)
	if !ok {
		return
	}
	result, err := b.runtime.Catalog(ctx)
	if err != nil {
		writeProblem(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Server error")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
