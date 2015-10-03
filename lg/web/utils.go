package web

import (
	"appengine"
	"appengine/user"
	"html/template"
	"net/http"
)

/**
 * Ensures that user is logged in for a given request and does a redirect the
 * login page first if user is not logged.
 *
 * Returns the current user if user is logged in otherwise nil.
 */
func EnsureUser(w http.ResponseWriter, r *http.Request) (*user.User, appengine.Context) {
	c := appengine.NewContext(r)
	u := user.Current(c)
	if u != nil {
		return u, c
	}

	url, err := user.LoginURL(c, r.URL.String())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return nil, c
	}

	w.Header().Set("Location", url)
	w.WriteHeader(http.StatusFound)
	return nil, c
}

/**
 * Renders the template with the context and sends the result to the response
 * stream.  Returns an error if any.
 */
func RenderResponse(ac appengine.Context, w http.ResponseWriter, template_name string, context map[string]interface{}) error {
	t, err := template.ParseFiles("templates/" + template_name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return err
	}
	logouturl, err := user.LogoutURL(ac, "/")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return err
	}
	context["SignoutUrl"] = logouturl

	loginurl, err := user.LoginURL(ac, "/")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return err
	}
	context["LoginUrl"] = loginurl
	t.Execute(w, context)
	return nil
}
