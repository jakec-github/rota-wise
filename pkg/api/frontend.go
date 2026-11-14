package api

import (
	"bytes"
	"io/fs"
	"net/http"
	"strings"
)

// baseTag is the literal <base> element web/index.html carries, and the one
// token the server rewrites when the site is served under a base path. It is a
// fixed string rather than a pattern over generated HTML: the build writes it
// through untouched, and web/build.ts fails the build if it ever stops being
// present, so a change to the source file is caught there rather than showing
// up as a page whose assets 404.
const baseTag = `<base href="/" />`

// frontendHandler serves the embedded frontend build with an SPA fallback:
// paths that match a file in the build are served as-is; anything else gets
// index.html so client-side routes resolve on hard navigation.
//
// base is the path the site's pages are served under, or "" for the root. Every
// asset reference in index.html is relative, so the <base> element is what they
// all resolve against — and it is also what the frontend reads back
// (web/src/basePath.ts) to prefix its own client routes. Rewriting that one
// element is the whole of what the frontend is told about the path, which is
// why the path can stay out of the build.
//
// It is registered as the mux's catch-all without a method pattern (see
// Routes), so it enforces the method itself: a page is only ever fetched.
func frontendHandler(frontend fs.FS, base string) http.Handler {
	fileServer := http.FileServerFS(frontend)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		path := strings.TrimPrefix(r.URL.Path, "/")
		if path != "" {
			if f, err := frontend.Open(path); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, r)
				return
			}
		}

		index, err := fs.ReadFile(frontend, "index.html")
		if err != nil {
			// hasFrontend checked for this file before the handler was
			// registered, so getting here means the build went missing under a
			// running server.
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(withBase(index, base))
	})
}

// rootPages are the app's own pages outside every Organisation. web/dev.ts
// keeps the same list.
var rootPages = map[string]bool{"guide": true}

// rootFrontendHandler serves everything at the root that is not the server's
// own: the splash at / and its assets under /site/, the app's assets at the
// root, the app itself — base unchanged, it already says the root — at the
// rootPages, and the same index.html with a 404 for every other path. The app
// reads the empty base path as "no Organisation" and draws its "Page not
// found", so a missing page and an unknown Organisation's address get the
// identical response. A missing splash asset gets it too.
//
// With no splash in site, / is left to the app like any other root page.
func rootFrontendHandler(frontend, site fs.FS) http.Handler {
	app := frontendHandler(frontend, "")
	splash, assets := splashFiles(site)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/")
		if path == "" && splash != nil {
			serveSplash(w, r, splash)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && path != "" {
			http.NotFound(w, r)
			return
		}
		if asset, ok := strings.CutPrefix(path, "site/"); ok && assets != nil && isFile(assets, asset) {
			http.StripPrefix("/site", http.FileServerFS(assets)).ServeHTTP(w, r)
			return
		}
		if rootPages[path] || (path == "" && splash == nil) || (!strings.HasPrefix(path, "site/") && isFile(frontend, path)) {
			app.ServeHTTP(w, r)
			return
		}
		index, err := fs.ReadFile(frontend, "index.html")
		if err != nil {
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_, _ = w.Write(index)
	})
}

// splashFiles reads the splash page and the filesystem of its assets out of
// site, or nil for both when site holds no page.
func splashFiles(site fs.FS) ([]byte, fs.FS) {
	if site == nil {
		return nil, nil
	}
	page, err := fs.ReadFile(site, "index.html")
	if err != nil {
		return nil, nil
	}
	assets, err := fs.Sub(site, "static")
	if err != nil {
		return page, nil
	}
	return page, assets
}

// serveSplash writes the splash page. Like every page, it is only ever fetched.
func serveSplash(w http.ResponseWriter, r *http.Request, page []byte) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(page)
}

// isFile reports whether name is a file in fsys — not a directory, which the
// file server would answer with a listing.
func isFile(fsys fs.FS, name string) bool {
	if name == "" {
		return false
	}
	info, err := fs.Stat(fsys, name)
	return err == nil && !info.IsDir()
}

// withBase points index.html's <base> element at the path the site is served
// under. An empty base leaves the document alone: the tag as built already says
// the root, which is where the site then is.
func withBase(index []byte, base string) []byte {
	if base == "" {
		return index
	}
	return bytes.Replace(index, []byte(baseTag), []byte(`<base href="`+base+`/" />`), 1)
}

// hasFrontend reports whether the filesystem holds a usable frontend build.
// Dev builds embed an empty dist/ placeholder, in which case the server stays
// API-only.
func hasFrontend(frontend fs.FS) bool {
	if frontend == nil {
		return false
	}
	_, err := fs.Stat(frontend, "index.html")
	return err == nil
}
