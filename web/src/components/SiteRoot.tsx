import Logo from "./Logo";
import OrganiserGuide from "./OrganiserGuide";
import "./SiteRoot.css";

// SiteRoot is the app outside every Organisation, when the server leaves the
// base path at the root: the organiser's guide at /guide, and "Page not found"
// anywhere else —
// including an unknown Organisation's address, which must look exactly like
// any other missing page. It fetches nothing: there is no Organisation here to
// ask about, and no session worth checking. The splash at / is not the app's:
// it is a static page of its own (site/), served by the server.
export default function SiteRoot({ pathname }: { pathname: string }) {
  if (pathname === "/guide") return <OrganiserGuide />;
  return <NotFound />;
}

function NotFound() {
  return (
    <main className="site-root">
      <Logo size={48} />
      <h1>Page not found</h1>
      <p>
        <a href="/">Go to the Rota Wise home page</a>
      </p>
    </main>
  );
}
