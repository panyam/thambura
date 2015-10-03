package web

import (
	"appengine"
	"appengine/user"
	"github.com/gorilla/mux"
	"html/template"
	"net/http"
)

type Page struct {
	User       *user.User
	LoginUrl   string
	SignoutUrl string
}

func init() {
	r := mux.NewRouter()
	s := http.StripPrefix("/static/", http.FileServer(http.Dir("./static/")))
	r.PathPrefix("/static/").Handler(s)
	r.HandleFunc("/", LandingHandler).Methods("GET")
	r.HandleFunc("/login/", LoginHandler).Methods("GET")

	r.HandleFunc("/apps/", ListAppsHandler).Methods("GET")
	r.HandleFunc("/apps/", CreateAppHandler).Methods("POST")
	r.HandleFunc("/apps/create/", CreateAppHandler).Methods("GET")
	r.HandleFunc("/apps/{appid}/", AppDetailsHandler).Methods("GET")
	r.HandleFunc("/apps/{appid}/", UpdateAppHandler).Methods("PUT")

	http.Handle("/", r)
}

func LandingHandler(w http.ResponseWriter, r *http.Request) {
	//body, _ := ioutil.ReadFile("templates/home.html")
	c := appengine.NewContext(r)
	u := user.Current(c)
	p := loadPage(c, u)
	t, _ := template.ParseFiles("templates/home.html")
	t.Execute(w, p)
}

func loadPage(c appengine.Context, u *user.User) *Page {
	signoutUrl, _ := user.LogoutURL(c, "/")
	loginUrl, _ := user.LoginURL(c, "/")
	return &Page{User: u, SignoutUrl: signoutUrl, LoginUrl: loginUrl}
}

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	params := mux.Vars(r)
	name := params["name"]
	w.Write([]byte("Login " + name))

}

func DashboardHandler(w http.ResponseWriter, r *http.Request) {
	params := mux.Vars(r)
	name := params["name"]
	w.Write([]byte("Dashboard " + name))
}
