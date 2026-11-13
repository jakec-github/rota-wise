// Package site embeds the splash page served at / outside every Organisation:
// a static page of its own rather than a screen of the app, so it needs no
// build and no JavaScript to read. index.html is the page; static/ holds what
// it loads, served under /site/ so it can never collide with the app's own
// assets at the root.
package site

import (
	"embed"
	"io/fs"
)

//go:embed index.html static
var files embed.FS

// FS returns the page and its assets, index.html at the root.
func FS() fs.FS { return files }
