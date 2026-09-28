import { useEffect, useState } from "react";
import { Student } from "./Student";
import { Teacher } from "./Teacher";
export function App() {
  const [teacher, setTeacher] = useState(
    location.pathname.startsWith("/teacher"),
  );
  useEffect(() => {
    const f = () => setTeacher(location.pathname.startsWith("/teacher"));
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, []);
  function go(value: boolean) {
    history.pushState({}, "", value ? "/teacher" : "/");
    setTeacher(value);
  }
  return (
    <>
      {teacher ? (
        <Teacher goStudent={() => go(false)} />
      ) : (
        <Student goTeacher={() => go(true)} />
      )}
      <footer className="site-footer">
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
        >
          苏ICP备2021038338号-1
        </a>
      </footer>
    </>
  );
}
