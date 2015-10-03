package web

import (
	"log"
	"net/http"
)

/**
 * Show all the apps for the current user.
 */
func ListAppsHandler(w http.ResponseWriter, r *http.Request) {
	// This bit of user check can be refactored so we dont duplicate it
	// everywhere
	currUser, aeContext := EnsureUser(w, r)
	if currUser == nil {
		return
	}

	log.Println("In this handler. yep")
	params := map[string]interface{}{"User": currUser}
	RenderResponse(aeContext, w, "apps.html", params)
}

/**
 * Create an app.
 */
func CreateAppHandler(w http.ResponseWriter, r *http.Request) {
	currUser, aeContext := EnsureUser(w, r)
	if currUser == nil {
		return
	}

	if r.Method == "GET" {
		params := map[string]interface{}{"User": currUser}
		RenderResponse(aeContext, w, "app_creator.html", params)
	} else {
		// handle POST
	}
}

/**
 * Show the dashboard for a particular app.
 */
func AppDetailsHandler(w http.ResponseWriter, r *http.Request) {
	currUser, aeContext := EnsureUser(w, r)
	if currUser == nil {
		return
	}

	params := map[string]interface{}{"User": currUser}
	RenderResponse(aeContext, w, "apps.html", params)
}

/**
 * Save/Update details for a particular app.
 */
func UpdateAppHandler(w http.ResponseWriter, r *http.Request) {
	currUser, aeContext := EnsureUser(w, r)
	if currUser == nil {
		return
	}

	params := map[string]interface{}{"User": currUser}
	RenderResponse(aeContext, w, "apps.html", params)
}
